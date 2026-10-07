import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, requireRole } from '../middleware/auth.js';
import { sanitizeRichHtml } from '../lib/html-sanitize.js';
import {
  getTeamSettings,
  updateTeamSettings,
  uploadLogo,
  uploadBackground,
  createInviteCode,
  getInviteCodes,
  regenerateInviteCodes,
  getMembers,
  updateMemberRole,
  removeMember,
  updateMemberStatus,
} from '../services/team.js';

export async function teamRoutes(app: FastifyInstance) {
  app.get('/settings', { preHandler: [authenticate, requireRole('admin')] }, async (_request: FastifyRequest, reply: FastifyReply) => {
    const settings = await getTeamSettings();
    if (!settings) {
      return reply.status(404).send({ error: '团队设置不存在' });
    }
    return { settings };
  });

  app.put('/settings', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as any;
    try {
      const result = await updateTeamSettings(
        request.user!.userId,
        {
          name: body.name,
          description: body.description,
          siteUrl: body.siteUrl,
          smtpHost: body.smtpHost,
          smtpPort: body.smtpPort,
          smtpUser: body.smtpUser,
          smtpPassword: body.smtpPassword,
          smtpFrom: body.smtpFrom,
          smtpSecure: body.smtpSecure,
          inviteCodeEnabled: body.inviteCodeEnabled,
          registrationEnabled: body.registrationEnabled,
          announcement: body.announcement,
          announcementFormat: body.announcementFormat,
          landingSubtitle: body.landingSubtitle,
          footerContent: body.footerContent,
          footerFormat: body.footerFormat,
          logRetentionDays: body.logRetentionDays,
          redisUrl: body.redisUrl,
        },
        request.ip,
        request.headers['user-agent'],
      );
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post('/logo', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: '请上传文件' });
    }

    const fileBuffer = await data.toBuffer();
    try {
      const result = await uploadLogo(
        fileBuffer,
        data.filename,
        data.mimetype,
        request.user!.userId,
        request.ip,
        request.headers['user-agent'],
      );
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post('/invite-codes', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as any;
    try {
      const result = await createInviteCode(
        request.user!.userId,
        body?.maxUses,
        body?.expiresAt,
        request.ip,
        request.headers['user-agent'],
      );
      return { code: result };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.get('/invite-codes', { preHandler: [authenticate, requireRole('admin')] }, async (_request: FastifyRequest, _reply: FastifyReply) => {
    const codes = await getInviteCodes();
    return { codes };
  });

  app.post('/invite-codes/regenerate', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as any;
    if (!body?.confirmed) {
      return reply.status(400).send({
        error: '请确认操作。重新生成会使所有现有邀请码失效，此操作不可撤销。',
        requiresConfirmation: true,
      });
    }

    try {
      const result = await regenerateInviteCodes(request.user!.userId, request.ip, request.headers['user-agent']);
      return { code: result };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.get('/members', { preHandler: [authenticate, requireRole('admin')] }, async (_request: FastifyRequest, _reply: FastifyReply) => {
    const members = await getMembers();
    return { members };
  });

  app.put('/members/:id/role', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;

    if (!body?.role || !['admin', 'member', 'guest'].includes(body.role)) {
      return reply.status(400).send({ error: '无效的角色，必须是 admin、member 或 guest' });
    }

    try {
      const result = await updateMemberRole(
        request.user!.userId,
        id,
        body.role,
        request.ip,
        request.headers['user-agent'],
      );
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.delete('/members/:id', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    try {
      await removeMember(
        request.user!.userId,
        id,
        request.ip,
        request.headers['user-agent'],
      );
      return { success: true };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.put('/members/:id/status', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;

    if (!body?.status || !['active', 'disabled'].includes(body.status)) {
      return reply.status(400).send({ error: '无效的状态，必须是 active 或 disabled' });
    }

    try {
      await updateMemberStatus(
        request.user!.userId,
        id,
        body.status,
        request.ip,
        request.headers['user-agent'],
      );
      return { success: true };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post('/background', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: '请上传文件' });
    }

    const fileBuffer = await data.toBuffer();
    try {
      const result = await uploadBackground(
        fileBuffer,
        data.filename,
        data.mimetype,
        request.user!.userId,
        request.ip,
        request.headers['user-agent'],
      );
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // 管理员：列出所有用户会话
  app.get('/sessions', { preHandler: [authenticate, requireRole('admin')] }, async () => {
    const { listAllSessions } = await import('../services/session.js');
    return { sessions: await listAllSessions() };
  });

  // 管理员：强制注销某用户所有会话
  app.delete('/users/:userId/sessions', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, _reply: FastifyReply) => {
    const { userId } = request.params as { userId: string };
    const { revokeAllUserSessions } = await import('../services/session.js');
    await revokeAllUserSessions(userId);
    await import('../lib/log.js').then(({ logOperation }) =>
      logOperation({
        userId: request.user!.userId,
        action: 'member.sessions_revoke',
        targetType: 'user',
        targetId: userId,
        detail: { reason: 'admin_force_revoke' },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] || null,
      }),
    );
    return { success: true };
  });
}

export async function publicTeamRoutes(app: FastifyInstance) {
  app.get('/landing', async () => {
    const settings = await getTeamSettings();
    if (!settings) {
      return { name: 'DMHub', subtitle: '', logoUrl: null, backgroundUrl: null, footerContent: '', footerFormat: 'markdown', announcement: null, announcementFormat: 'markdown', inviteCodeEnabled: true, registrationEnabled: true };
    }
    return {
      name: settings.name || 'DMHub',
      subtitle: settings.landingSubtitle || '',
      logoUrl: settings.logoUrl || null,
      backgroundUrl: settings.landingBackgroundUrl || null,
      footerContent: settings.footerFormat === 'html'
        ? await sanitizeRichHtml(settings.footerContent || '')
        : (settings.footerContent || ''),
      footerFormat: settings.footerFormat || 'markdown',
      announcement: settings.announcement && settings.announcementFormat === 'html'
        ? await sanitizeRichHtml(settings.announcement)
        : (settings.announcement || null),
      announcementFormat: settings.announcementFormat || 'markdown',
      inviteCodeEnabled: settings.inviteCodeEnabled ?? true,
      registrationEnabled: settings.registrationEnabled ?? true,
    };
  });
}
