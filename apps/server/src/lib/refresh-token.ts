/**
 * 刷新令牌的错误语义。
 *
 * 单独成文件是为了不依赖数据库等运行时资源，便于单元测试。
 */
import { REFRESH_ERROR_CODES } from '@dmhub/shared';

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
