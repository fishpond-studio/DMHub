/**
 * 刷新令牌的错误语义。
 *
 * 单独成文件是为了不依赖数据库等运行时资源，便于单元测试。
 */
import { REFRESH_ERROR_CODES } from '@dmhub/shared';

/**
 * 轮换宽限窗口：令牌被消费后的这段时间内再次出现，只可能是并发请求
 * （另一个请求已经拿到新令牌）。超过窗口仍在使用旧令牌视为重放。
 */
export const REFRESH_TOKEN_ROTATION_GRACE_MS = 60_000;

/**
 * 已轮换令牌的保留时间。保留一段时间才能沿 replaced_by_hash 链条
 * 找到并撤销后继令牌；过期后由清理任务删除。
 */
export const REFRESH_TOKEN_ROTATED_RETENTION_MS = 24 * 60 * 60 * 1000;

/** 已登记刷新令牌中与判定相关的字段 */
export interface StoredRefreshToken {
  expiresAt: Date | string;
  rotatedAt: Date | string | null;
}

export type RefreshTokenState =
  /** 仍是当前令牌，可以轮换 */
  | { action: 'rotate' }
  /** 刚被另一个请求消费：保留 cookie，客户端重试即可 */
  | { action: 'reused' }
  /** 确实不可用：会话结束，清除 cookie */
  | { action: 'invalid'; reason: 'missing' | 'expired' | 'replayed' };

/**
 * 判断一个刷新令牌还能不能继续用。
 *
 * 「库里查不到」不再一律当成多标签页竞态：它同样可能是用户已登出、
 * 会话被吊销或令牌从未登记。真正的竞态必须由 rotated_at 证明 ——
 * 只有最近刚被消费的令牌才返回 reused。
 */
export function classifyStoredRefreshToken(
  stored: StoredRefreshToken | null | undefined,
  now = Date.now(),
): RefreshTokenState {
  if (!stored) {
    return { action: 'invalid', reason: 'missing' };
  }

  if (stored.rotatedAt !== null && stored.rotatedAt !== undefined) {
    const rotatedAt = new Date(stored.rotatedAt).getTime();
    if (now - rotatedAt <= REFRESH_TOKEN_ROTATION_GRACE_MS) {
      return { action: 'reused' };
    }
    return { action: 'invalid', reason: 'replayed' };
  }

  if (new Date(stored.expiresAt).getTime() < now) {
    return { action: 'invalid', reason: 'expired' };
  }

  return { action: 'rotate' };
}


/**
 * 刷新令牌被拒绝。
 *
 * - reusable = true：令牌只是刚被别的请求抢先消费（多标签页轮换竞态），
 *   对方稍后会写回新 cookie，客户端重试即可恢复，不算会话失效。
 * - reusable = false：令牌确实无效或已过期，会话结束，必须重新登录。
 */
export class RefreshTokenRejectedError extends Error {
  readonly reusable: boolean;

  constructor(reusable: boolean, message = '刷新令牌无效或已过期') {
    super(message);
    this.name = 'RefreshTokenRejectedError';
    this.reusable = reusable;
  }
}

export interface RefreshFailure {
  status: number;
  code: string;
  message: string;
  /** 是否清掉刷新 cookie：只有会话真的结束时才清 */
  clearCookie: boolean;
}

/**
 * 把刷新失败映射成 HTTP 响应。
 *
 * - 令牌确实不可用：401 + INVALID，并清掉 cookie（会话结束）
 * - 令牌被别的请求抢先消费：401 + REUSED，保留 cookie，客户端重试即可
 * - 服务端临时故障：503 + UNAVAILABLE，保留 cookie，客户端稍后重试
 *
 * 临时故障绝不能清 cookie，否则一次网络抖动就会把用户踢出登录态。
 */
export function describeRefreshFailure(err: unknown): RefreshFailure {
  if (err instanceof RefreshTokenRejectedError) {
    return err.reusable
      ? {
          status: 401,
          code: REFRESH_ERROR_CODES.REUSED,
          message: err.message,
          clearCookie: false,
        }
      : {
          status: 401,
          code: REFRESH_ERROR_CODES.INVALID,
          message: err.message,
          clearCookie: true,
        };
  }
  return {
    status: 503,
    code: REFRESH_ERROR_CODES.UNAVAILABLE,
    message: '刷新服务暂时不可用，请稍后重试',
    clearCookie: false,
  };
}
