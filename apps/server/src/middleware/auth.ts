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

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: '未认证' });
  }
  const token = authHeader.slice(7);
  try {
    const payload = verifyToken(token);
    if ('scope' in payload && (payload as TwoFAPayload).scope === '2fa') {
      return reply.status(401).send({ error: '无效的令牌' });
    }
    const accessPayload = payload as AccessPayload;
    // 令牌类型校验：防止将 RefreshToken 当作 AccessToken 使用
    if (!accessPayload.role || typeof accessPayload.role !== 'string') {
      return reply.status(401).send({ error: '无效的访问令牌' });
    }
    request.user = { userId: accessPayload.userId, role: accessPayload.role };
  } catch {
    return reply.status(401).send({ error: '令牌无效或已过期' });
  }
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
