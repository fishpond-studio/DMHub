import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { JWT_ACCESS_EXPIRY, JWT_REFRESH_EXPIRY, JWT_2FA_EXPIRY } from '@dmhub/shared';

export interface AccessPayload {
  userId: string;
  role: string;
}

export interface RefreshPayload {
  userId: string;
  /** 登录时是否勾选「记住我」：决定刷新后 cookie 保持持久还是会话级 */
  remember?: boolean;
}

export interface TwoFAPayload {
  userId: string;
  scope: '2fa';
}

export type TokenPayload = AccessPayload | RefreshPayload | TwoFAPayload;

export function signAccessToken(userId: string, role: string): string {
  return jwt.sign({ userId, role }, config.JWT_SECRET, { algorithm: 'HS256', expiresIn: JWT_ACCESS_EXPIRY });
}

export function signRefreshToken(userId: string, remember = false): string {
  // 只在勾选时写入 claim：不勾选的令牌保持与旧版一致的载荷
  const payload = remember ? { userId, remember: true } : { userId };
  return jwt.sign(payload, config.JWT_SECRET, { algorithm: 'HS256', expiresIn: JWT_REFRESH_EXPIRY });
}

export function sign2FAToken(userId: string): string {
  return jwt.sign({ userId, scope: '2fa' }, config.JWT_SECRET, { algorithm: 'HS256', expiresIn: JWT_2FA_EXPIRY });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] }) as TokenPayload;
}
