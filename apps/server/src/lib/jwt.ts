import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { JWT_ACCESS_EXPIRY, JWT_REFRESH_EXPIRY, JWT_2FA_EXPIRY } from '@dmhub/shared';

export interface AccessPayload {
  userId: string;
  role: string;
}

export interface RefreshPayload {
  userId: string;
}

export interface TwoFAPayload {
  userId: string;
  scope: '2fa';
}

export type TokenPayload = AccessPayload | RefreshPayload | TwoFAPayload;

export function signAccessToken(userId: string, role: string): string {
  return jwt.sign({ userId, role }, config.JWT_SECRET, { algorithm: 'HS256', expiresIn: JWT_ACCESS_EXPIRY });
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ userId }, config.JWT_SECRET, { algorithm: 'HS256', expiresIn: JWT_REFRESH_EXPIRY });
}

export function sign2FAToken(userId: string): string {
  return jwt.sign({ userId, scope: '2fa' }, config.JWT_SECRET, { algorithm: 'HS256', expiresIn: JWT_2FA_EXPIRY });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] }) as TokenPayload;
}
