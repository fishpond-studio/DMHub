import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { getUserById, changePassword, updateProfile, changeEmail, sendEmailChangeCode, confirmEmailChange, generateUserToken, listUserTokens, revokeUserToken } from '../services/auth.js';

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
    if (body?.avatarUrl && typeof body.avatarUrl === 'string') {
      const trimmed = body.avatarUrl.trim();
      // 仅允许 http/https 或本站 /uploads 相对路径头像，杜绝 javascript:/data: 脚本注入风险
      if (!trimmed.startsWith('/') && !trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
        return reply.status(400).send({ error: '头像地址格式无效，仅支持 HTTP/HTTPS 或本站相对路径' });
      }
    }
    try {
      const user = await updateProfile(request.user!.userId, {
        displayName: body?.displayName,
        nickname: body?.nickname,
        avatarUrl: body?.avatarUrl,
        notificationsEnabled: body?.notificationsEnabled,
        emailNotificationsEnabled: body?.emailNotificationsEnabled,
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

  // 发送邮箱验证码：带 email + password 表示换绑/首次绑定；不带表示验证当前未验证邮箱
  app.post('/me/email/verify/send', {
    preHandler: [authenticate],
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { email?: string; password?: string } | undefined;
    try {
      const result = await sendEmailChangeCode(request.user!.userId, body?.email, body?.password);
      return { success: true, sentTo: result.sentTo };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // 校验邮箱验证码，成功后更新（或验证）邮箱
  app.post('/me/email/verify', {
    preHandler: [authenticate],
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { code?: string; scope?: string } | undefined;
    if (!body?.code || typeof body.code !== 'string') {
      return reply.status(400).send({ error: '请输入验证码' });
    }
    if (body.scope !== undefined && body.scope !== 'email-change' && body.scope !== 'email-verify') {
      return reply.status(400).send({ error: '无效的验证范围' });
    }
    try {
      const user = await confirmEmailChange(request.user!.userId, body.code.trim(), body.scope as 'email-change' | 'email-verify' | undefined);
      return { user };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
  app.post('/me/tokens', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as any;
    if (!body?.name || typeof body.name !== 'string') {
      return reply.status(400).send({ error: '请输入令牌名称' });
    }
    if (!body?.permissions || !Array.isArray(body.permissions) || body.permissions.length === 0) {
      return reply.status(400).send({ error: '请选择至少一个权限' });
    }

    // 严格白名单校验个人 Token 权限：非管理员不可请求系统通配符权限 '*'
    const allowedUserPermissions = ['domains:read', 'records:read', 'records:write'];
    const invalid = body.permissions.filter((p: string) => !allowedUserPermissions.includes(p));
    if (invalid.length > 0) {
      return reply.status(400).send({ error: `包含未授权或无效权限: ${invalid.join(', ')}` });
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
