/**
 * 访问令牌（JWT）的本地解析与刷新判定。
 *
 * 单独成文件是为了不依赖 Vue、路由等运行时环境，便于单元测试。
 */
import { REFRESH_ERROR_CODES } from '@dmhub/shared';

/** 主动刷新阈值：令牌剩余有效期不足该值时就提前刷新（毫秒） */
export const ACCESS_TOKEN_REFRESH_SKEW_MS = 60_000;

export { REFRESH_ERROR_CODES };

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** 解析 JWT 载荷里的过期时间（毫秒时间戳）；无法解析时返回 null */
export function getTokenExpiry(token: string | null): number | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(decodeBase64Url(parts[1]));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** 令牌是否已经过期；无法解析时交由服务端判断 */
export function isAccessTokenExpired(token: string | null, now: number = Date.now()): boolean {
  if (!token) return true;
  const expiry = getTokenExpiry(token);
  if (expiry === null) return false;
  return expiry <= now;
}

/** 令牌是否已过期或即将过期（需要刷新） */
export function needsRefresh(
  token: string | null,
  now: number = Date.now(),
  skewMs: number = ACCESS_TOKEN_REFRESH_SKEW_MS,
): boolean {
  return isAccessTokenExpired(token, now + skewMs);
}

/** 服务端是否明确拒绝了刷新令牌（401） */
export function isRefreshRejected(status?: number): boolean {
  return status === 401;
}

/**
 * 刷新令牌是否只是被别的请求抢先消费（多标签页轮换竞态）。
 * 这种情况下对方的响应会写回新 cookie，稍后重试即可恢复，不该判定为会话失效。
 */
export function isRefreshReused(status?: number, code?: string): boolean {
  return status === 401 && code === REFRESH_ERROR_CODES.REUSED;
}

/**
 * 会话确实失效：刷新令牌被服务端判定为不可用，必须重新登录。
 *
 * 网络抖动、服务端临时错误、限流等都不会抛出该错误 —— 把用户踢出登录态
 * 只应该发生在服务端明确拒绝刷新令牌时。
 */
export class SessionExpiredError extends Error {
  constructor(message = '会话已失效，请重新登录') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

/** 只关心响应元信息的错误形状（axios 错误） */
export interface HttpErrorLike {
  response?: {
    status?: number;
    data?: { error?: string; code?: string };
  };
}

/** 读取刷新失败里的状态码、错误码与提示文案 */
export function readRefreshRejection(err: unknown): {
  status?: number;
  code?: string;
  message?: string;
} {
  const response = (err as HttpErrorLike)?.response;
  return {
    status: response?.status,
    code: response?.data?.code,
    message: response?.data?.error,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 刷新访问令牌，失败时按退避重试。
 *
 * - 服务端明确判定令牌无效 → 抛 {@link SessionExpiredError}，调用方应登出
 * - 多标签页轮换竞态 / 网络异常 / 5xx / 限流 → 退避重试，重试耗尽后仍按临时故障抛出
 *   （调用方不应因此登出，登录态保持不变）
 */
export async function refreshWithRetry(
  run: () => Promise<string>,
  delays: number[] = [0, 400, 1200],
): Promise<string> {
  let lastError: unknown;

  for (const delay of delays) {
    if (delay > 0) await sleep(delay);
    try {
      return await run();
    } catch (err) {
      lastError = err;
      const { status, code, message } = readRefreshRejection(err);
      if (isRefreshRejected(status) && !isRefreshReused(status, code)) {
        // 服务端明确判定刷新令牌无效：会话确实已经失效
        throw new SessionExpiredError(message);
      }
      // 其余情况（网络异常 / 5xx / 限流 / 多标签页轮换竞态）都按临时故障重试
    }
  }

  const { status, message } = readRefreshRejection(lastError);
  if (isRefreshRejected(status)) {
    // 重试期间一直是 401：会话确实已经失效
    throw new SessionExpiredError(message);
  }
  throw lastError instanceof Error ? lastError : new Error('刷新访问令牌失败');
}
