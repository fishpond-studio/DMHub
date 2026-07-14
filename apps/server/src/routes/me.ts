import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { getUserById, changePassword, updateProfile, changeEmail, generateUserToken, listUserTokens, revokeUserToken } from '../services/auth.js';

export async function meRoutes(app: FastifyInstance) {
  app.get('/me', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await getUserById(request.user!.userId);
    if (!user) {
      return reply.status(404).send({ error: '用户不存在' });
    }
    return { user };
  });

  app.put('/me/password', {
    preHandler: [authenticate],
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as any;
    if (!body?.oldPassword || !body?.newPassword) {
      return reply.status(400).send({ error: '请输入当前密码和新密码' });
    }
    try {
      await changePassword(request.user!.userId, body.oldPassword, body.newPassword);
      return { success: true };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.put('/me/profile', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as any;
    try {
      const user = await updateProfile(request.user!.userId, {
        displayName: body?.displayName,
        nickname: body?.nickname,
        avatarUrl: body?.avatarUrl,
        notificationsEnabled: body?.notificationsEnabled,
      });
      return { user };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.put('/me/email', {
    preHandler: [authenticate],
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as any;
    if (!body?.password) {
      return reply.status(400).send({ error: '请输入密码以确认身份' });
    }
    try {
      const user = await changeEmail(request.user!.userId, body.email || '', body.password);
      return { user };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post('/me/tokens', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as any;
    if (!body?.name) {
      return reply.status(400).send({ error: '请输入令牌名称' });
    }
    if (!body?.permissions || !Array.isArray(body.permissions) || body.permissions.length === 0) {
      return reply.status(400).send({ error: '请选择至少一个权限' });
    }
    try {
      const result = await generateUserToken(request.user!.userId, body.name, body.permissions);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.get('/me/tokens', { preHandler: [authenticate] }, async (request: FastifyRequest, _reply: FastifyReply) => {
    const tokens = await listUserTokens(request.user!.userId);
    return { tokens };
  });

  app.delete('/me/tokens/:id', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    try {
      await revokeUserToken(request.user!.userId, id);
      return { success: true };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
