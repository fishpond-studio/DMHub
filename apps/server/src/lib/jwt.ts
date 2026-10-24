import jwt, { type SignOptions } from 'jsonwebtoken';
import { config } from '../config/index.js';
import { JWT_ACCESS_EXPIRY, JWT_REFRESH_EXPIRY, JWT_SESSION_EXPIRY, JWT_2FA_EXPIRY } from '@dmhub/shared';

export interface AccessPayload {
  userId: string;
  role: string;
}

export interface RefreshPayload {
  userId: string;
  /** 登录时是否勾选「记住我」：决定刷新后 cookie 保持持久还是会话级 */
  remember?: boolean;
  /** jwt.sign 自动写入：签发时间（秒） */
  iat?: number;
  /** jwt.sign 自动写入：绝对到期时间（秒） */
  exp?: number;
}

export interface TwoFAPayload {
  userId: string;
  scope: '2fa';
}

export type TokenPayload = AccessPayload | RefreshPayload | TwoFAPayload;

export function signAccessToken(userId: string, role: string): string {
  return jwt.sign({ userId, role }, config.JWT_SECRET, { algorithm: 'HS256', expiresIn: JWT_ACCESS_EXPIRY });
}

/**
 * 签发刷新令牌。
 *
 * - 记住我：7 天，每次轮换重新起算（滑动续期）
 * - 未记住：24 小时绝对到期，轮换时传入剩余秒数即可保持原截止点
 */
export function signRefreshToken(
  userId: string,
  remember = false,
  expiresIn: SignOptions['expiresIn'] = remember ? JWT_REFRESH_EXPIRY : JWT_SESSION_EXPIRY,
): string {
  // 只在勾选时写入 claim：不勾选的令牌保持与旧版一致的载荷
  const payload = remember ? { userId, remember: true } : { userId };
  return jwt.sign(payload, config.JWT_SECRET, { algorithm: 'HS256', expiresIn });
}

/**
 * 轮换时新令牌的有效期（秒）。
 *
 * - 记住我：返回 undefined，使用默认的 7 天滑动续期
 * - 未记住：沿用旧令牌的绝对到期时间，刷新不能延长会话
 */
export function refreshExpiryForRotation(
  payload: RefreshPayload,
  remember: boolean,
  nowSeconds = Math.floor(Date.now() / 1000),
): SignOptions['expiresIn'] | undefined {
  if (remember) return undefined;
  if (typeof payload.exp !== 'number') return undefined;
  return Math.max(1, payload.exp - nowSeconds);
}

/** 读取刷新令牌自身的到期时间；无法解析时返回 null */
export function refreshTokenExpiresAt(token: string): Date | null {
  const decoded = jwt.decode(token);
  if (!decoded || typeof decoded !== 'object') return null;
  const exp = (decoded as { exp?: unknown }).exp;
  return typeof exp === 'number' ? new Date(exp * 1000) : null;
}

export function sign2FAToken(userId: string): string {
  return jwt.sign({ userId, scope: '2fa' }, config.JWT_SECRET, { algorithm: 'HS256', expiresIn: JWT_2FA_EXPIRY });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] }) as TokenPayload;
}
