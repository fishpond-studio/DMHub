import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { authenticate, requireRole, resolveAccessToken } from '../middleware/auth.js';
import { getDb } from '../db/index.js';
import { notificationConfigs } from '../db/schema.js';
import { insertReturningAll } from '../db/helpers.js';
import { notificationConfigSchema } from '@dmhub/shared';
import { logOperation } from '../lib/log.js';
import {
  addSSEClient,
  removeSSEClient,
  getStoredNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteStoredNotification,
  clearStoredNotifications,
  triggerNotification,
  getSSEClientCount,
} from '../services/notification.js';

const MAX_CONNECTIONS_PER_USER = 5;

export async function notificationRoutes(app: FastifyInstance) {
  app.get('/stream', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { token?: string };
    const token = query.token || request.headers.authorization?.slice(7);
    if (!token) {
      return reply.status(401).send({ error: '未认证' });
    }

    // EventSource 无法自定义请求头，令牌只能走查询参数
    const user = resolveAccessToken(token);
    if (!user) {
      return reply.status(401).send({ error: '令牌无效或已过期' });
    }
    const userId = user.userId;

    // SSE 连接数限制
    if (getSSEClientCount(userId) >= MAX_CONNECTIONS_PER_USER) {
      return reply.status(429).send({ error: 'SSE 连接数已达上限' });
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const client = { send: (data: string) => {
      try {
        reply.raw.write(data);
      } catch {}
    } };

    addSSEClient(userId, client);

    reply.raw.write(`data: ${JSON.stringify({ event: 'connected' })}\n\n`);

    request.raw.on('close', () => {
      removeSSEClient(userId, client);
    });
  });

  app.get('/', { preHandler: [authenticate] }, async (request: FastifyRequest) => {
    const userId = request.user!.userId;
    const notifications = getStoredNotifications(userId);
    return {
      notifications,
      unreadCount: getUnreadCount(userId),
    };
  });

  app.post('/:id/read', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const ok = markNotificationRead(request.user!.userId, id);
    if (!ok) return reply.status(404).send({ error: '通知不存在' });
    return { success: true, unreadCount: getUnreadCount(request.user!.userId) };
  });

  app.post('/read-all', { preHandler: [authenticate] }, async (request: FastifyRequest) => {
    const count = markAllNotificationsRead(request.user!.userId);
    return { success: true, marked: count, unreadCount: 0 };
  });

  app.delete('/:id', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const ok = deleteStoredNotification(request.user!.userId, id);
    if (!ok) return reply.status(404).send({ error: '通知不存在' });
    return { success: true, unreadCount: getUnreadCount(request.user!.userId) };
  });

  app.delete('/', { preHandler: [authenticate] }, async (request: FastifyRequest) => {
    const cleared = clearStoredNotifications(request.user!.userId);
    return { success: true, cleared, unreadCount: 0 };
  });

  app.post('/', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = notificationConfigSchema.safeParse(request.body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return reply.status(400).send({ error: firstError?.message || '参数验证失败' });
    }

    const result = await insertReturningAll(notificationConfigs, {
      channel: parsed.data.channel,
      name: parsed.data.name,
      config: parsed.data.config,
      events: parsed.data.events,
      enabled: parsed.data.enabled,
    });

    await triggerNotification('notification.update', {
      title: '通知配置已创建',
      content: `通知配置「${result.name}」（${result.channel}）已创建`,
      level: 'info',
      metadata: { action: 'created', configId: result.id },
    });

    await logOperation({
      userId: request.user!.userId,
      action: 'notification.update',
      targetType: 'notification_config',
      targetId: result.id,
      detail: { action: 'created', name: result.name, channel: result.channel },
    });

    return result;
  });

  app.get('/configs', { preHandler: [authenticate, requireRole('admin')] }, async (_request: FastifyRequest) => {
    const db = getDb();
    const configs = await db.select().from(notificationConfigs);
    return { configs };
  });

  app.get('/configs/:id', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const [config] = await db.select().from(notificationConfigs).where(eq(notificationConfigs.id, id)).limit(1);
    if (!config) {
      return reply.status(404).send({ error: '通知配置不存在' });
    }
    return config;
  });

  app.put('/configs/:id', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const parsed = notificationConfigSchema.safeParse(request.body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return reply.status(400).send({ error: firstError?.message || '参数验证失败' });
    }

    const db = getDb();
    const [existing] = await db.select().from(notificationConfigs).where(eq(notificationConfigs.id, id)).limit(1);
    if (!existing) {
      return reply.status(404).send({ error: '通知配置不存在' });
    }

    await db
      .update(notificationConfigs)
      .set({
        channel: parsed.data.channel,
        name: parsed.data.name,
        config: parsed.data.config,
        events: parsed.data.events,
        enabled: parsed.data.enabled,
        updatedAt: new Date(),
      })
      .where(eq(notificationConfigs.id, id));
    const [result] = await db.select().from(notificationConfigs).where(eq(notificationConfigs.id, id));

    await triggerNotification('notification.update', {
      title: '通知配置已修改',
      content: `通知配置「${parsed.data.name}」（${parsed.data.channel}）已被修改`,
      level: 'info',
      metadata: { action: 'updated', configId: id },
    });

    await logOperation({
      userId: request.user!.userId,
      action: 'notification.update',
      targetType: 'notification_config',
      targetId: id,
      detail: { action: 'updated', name: parsed.data.name, channel: parsed.data.channel },
    });

    return result;
  });

  app.delete('/configs/:id', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const db = getDb();

    const [existing] = await db.select().from(notificationConfigs).where(eq(notificationConfigs.id, id)).limit(1);
    if (!existing) {
      return reply.status(404).send({ error: '通知配置不存在' });
    }

    await db.delete(notificationConfigs).where(eq(notificationConfigs.id, id));

    await triggerNotification('notification.update', {
      title: '通知配置已删除',
      content: `通知配置「${existing.name}」（${existing.channel}）已被删除`,
      level: 'warning',
      metadata: { action: 'deleted', configId: id },
    });

    await logOperation({
      userId: request.user!.userId,
      action: 'notification.update',
      targetType: 'notification_config',
      targetId: id,
      detail: { action: 'deleted', name: existing.name, channel: existing.channel },
    });

    return { success: true };
  });
}
