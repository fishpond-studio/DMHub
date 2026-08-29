import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyApiKey, checkRateLimit } from '../services/api-key.js';
import { verifyUserToken } from '../services/auth.js';

declare module 'fastify' {
  interface FastifyRequest {
    apiKeyInfo?: {
      keyId: string;
      permissions: string[];
      userId?: string;
      userRole?: string;
    };
  }
}

export async function apiKeyAuth(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: '未提供 API 密钥' });
  }

  const token = authHeader.slice(7);

  if (token.startsWith('dmhub_pt_')) {
    const result = await verifyUserToken(token);
    if (!result.valid || !result.tokenId || !result.permissions) {
      return reply.status(401).send({ error: '令牌无效或已过期' });
    }

    if (!(await checkRateLimit(result.tokenId))) {
      return reply.status(429).send({ error: '请求频率超限，每分钟最多 100 次请求' });
    }

    request.apiKeyInfo = {
      keyId: result.tokenId,
      permissions: result.permissions,
      userId: result.userId,
      userRole: result.userRole,
    };
    return;
  }

  if (!token.startsWith('dmhub_')) {
    return reply.status(401).send({ error: '无效的 API 密钥格式' });
  }

  const result = await verifyApiKey(token);
  if (!result.valid || !result.keyId || !result.permissions) {
    return reply.status(401).send({ error: 'API 密钥无效或已过期' });
  }

  if (!(await checkRateLimit(result.keyId))) {
    return reply.status(429).send({ error: '请求频率超限，每分钟最多 100 次请求' });
  }

  request.apiKeyInfo = {
    keyId: result.keyId,
    permissions: result.permissions,
  };
}

export function requireApiKeyPermission(permission: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.apiKeyInfo) {
      return reply.status(401).send({ error: '未认证' });
    }
    if (!request.apiKeyInfo.permissions.includes(permission) && !request.apiKeyInfo.permissions.includes('*')) {
      return reply.status(403).send({ error: 'API 密钥权限不足' });
    }
  };
}
