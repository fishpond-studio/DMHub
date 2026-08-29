import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { loginSchema, registerSchema } from '@dmhub/shared';
import { register, login, refreshAuth, logout } from '../services/auth.js';
import { config } from '../config/index.js';
import { authenticate } from '../middleware/auth.js';
import { logOperation } from '../lib/log.js';
import {
  listUserSessions,
  revokeSession,
  revokeOtherSessions,
  hashRefreshToken,
} from '../services/session.js';
import { getDb } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const COOKIE_OPTIONS_REMEMBER = {
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: (config.NODE_ENV === 'production' ? 'strict' : 'lax') as 'strict' | 'lax',
  path: '/api/auth',
  maxAge: 30 * 24 * 60 * 60,
};

const COOKIE_OPTIONS_SESSION = {
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: (config.NODE_ENV === 'production' ? 'strict' : 'lax') as 'strict' | 'lax',
  path: '/api/auth',
};

export async function authRoutes(app: FastifyInstance) {
  app.post('/register', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten().fieldErrors });
    }

    try {
      const deviceInfo = request.headers['user-agent'] as string | undefined;
      const result = await register(parsed.data, deviceInfo);
      reply.setCookie('refresh_token', result.refreshToken, COOKIE_OPTIONS_SESSION);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post('/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten().fieldErrors });
    }

    try {
      const deviceInfo = request.headers['user-agent'] as string | undefined;
      const result = await login(parsed.data.username, parsed.data.password, deviceInfo, request.ip, request.headers['user-agent']);

      if (result.requires2FA) {
        return { requires2FA: true, tempToken: result.tempToken };
      }

      const cookieOptions = parsed.data.rememberMe ? COOKIE_OPTIONS_REMEMBER : COOKIE_OPTIONS_SESSION;
      reply.setCookie('refresh_token', result.refreshToken, cookieOptions);
      return { accessToken: result.accessToken, refreshToken: result.refreshToken, user: result.user };
    } catch (err: any) {
      if (err.message === '用户名或密码错误') {
        // 记录登录失败（用户存在时关联 user_id）
        try {
          const db = getDb();
          const [u] = await db.select({ id: users.id }).from(users)
            .where(eq(users.username, parsed.data.username)).limit(1);
          if (u) {
            await logOperation({
              userId: u.id, action: 'login_failed', targetType: 'user', targetId: u.id,
              detail: { reason: 'invalid_password' },
              ipAddress: request.ip, userAgent: request.headers['user-agent'] || null,
            });
          }
        } catch {}
        return reply.status(401).send({ error: '用户名或密码错误' });
      }
      if (err.message === '账号已被禁用') {
        return reply.status(403).send({ error: '账号已被禁用' });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post('/refresh', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const refreshToken = request.cookies.refresh_token || (request.body as any)?.refreshToken;
    if (!refreshToken) {
      return reply.status(401).send({ error: '缺少刷新令牌' });
    }

    try {
      const deviceInfo = request.headers['user-agent'] as string | undefined;
      const existingCookie = request.cookies.refresh_token;
      const result = await refreshAuth(refreshToken, deviceInfo);
      const cookieOptions = existingCookie ? COOKIE_OPTIONS_REMEMBER : COOKIE_OPTIONS_SESSION;
      reply.setCookie('refresh_token', result.refreshToken, cookieOptions);
      return { accessToken: result.accessToken, refreshToken: result.refreshToken };
    } catch (err: any) {
      reply.clearCookie('refresh_token', { path: '/api/auth' });
      return reply.status(401).send({ error: err.message || '刷新令牌无效' });
    }
  });

  app.post('/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    const refreshToken = request.cookies.refresh_token || (request.body as any)?.refreshToken;
    if (refreshToken) {
      try {
        await logout(refreshToken);
      } catch {}
    }
    reply.clearCookie('refresh_token', { path: '/api/auth' });
    return { success: true };
  });

  // 会话管理：列出当前用户的登录会话
  app.get('/sessions', { preHandler: [authenticate] }, async (request: FastifyRequest) => {
    const cookieToken = request.cookies.refresh_token;
    const currentHash = cookieToken ? hashRefreshToken(cookieToken) : undefined;
    return { sessions: await listUserSessions(request.user!.userId, currentHash) };
  });

  // 注销指定会话
  app.delete('/sessions/:id', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const cookieToken = request.cookies.refresh_token;
    const currentHash = cookieToken ? hashRefreshToken(cookieToken) : '';
    const sessions = await listUserSessions(request.user!.userId, currentHash);
    const target = sessions.find((s) => s.id === id);
    if (target?.current) {
      return reply.status(400).send({ error: '不能注销当前会话，请使用退出登录' });
    }
    const ok = await revokeSession(request.user!.userId, id);
    if (!ok) return reply.status(404).send({ error: '会话不存在' });
    return { success: true };
  });

  // 注销所有其他会话
  app.delete('/sessions', { preHandler: [authenticate] }, async (request: FastifyRequest) => {
    const cookieToken = request.cookies.refresh_token;
    if (!cookieToken) return { success: true };
    await revokeOtherSessions(request.user!.userId, hashRefreshToken(cookieToken));
    return { success: true };
  });
}
