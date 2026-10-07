import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken, type AccessPayload, type TwoFAPayload } from '../lib/jwt.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      userId: string;
      role: string;
    };
  }
}

/**
 * 校验 Bearer 令牌并取出访问身份。
 *
 * 这里同时拒绝 2FA 临时令牌与刷新令牌：两者都只是合法的 JWT 签名，
 * 但只有携带 `role` 的访问令牌才允许当作登录态使用。
 */
export function resolveAccessToken(token: string): { userId: string; role: string } | null {
  try {
    const payload = verifyToken(token);
    if ('scope' in payload && (payload as TwoFAPayload).scope === '2fa') return null;
    const accessPayload = payload as AccessPayload;
    if (!accessPayload.role || typeof accessPayload.role !== 'string') return null;
    return { userId: accessPayload.userId, role: accessPayload.role };
  } catch {
    return null;
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: '未认证' });
  }
  const user = resolveAccessToken(authHeader.slice(7));
  if (!user) {
    return reply.status(401).send({ error: '令牌无效或已过期' });
  }
  request.user = user;
}

export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user || !roles.includes(request.user.role)) {
      return reply.status(403).send({ error: '权限不足' });
    }
  };
}

export async function require2FA(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: '未认证' });
  }
  const token = authHeader.slice(7);
  try {
    const payload = verifyToken(token) as TwoFAPayload;
    if (payload.scope !== '2fa') {
      return reply.status(401).send({ error: '需要2FA验证' });
    }
    request.user = { userId: payload.userId, role: '' };
  } catch {
    return reply.status(401).send({ error: '令牌无效或已过期' });
  }
}
