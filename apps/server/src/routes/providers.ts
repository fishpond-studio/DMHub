import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, requireRole } from '../middleware/auth.js';
import {
  createProviderConfig,
  listProviderConfigs,
  getProviderConfig,
  updateProviderConfig,
  deleteProviderConfig,
  testProviderConnection,
  syncProviderDomains,
} from '../services/provider.js';
import { triggerNotification } from '../services/notification.js';

export async function providerRoutes(app: FastifyInstance) {
  app.post('/', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as any;
    if (!body?.name || !body?.providerId || !body?.credentials) {
      return reply.status(400).send({ error: '缺少必要字段: name, providerId, credentials' });
    }
    try {
      const result = await createProviderConfig(
        request.user!.userId,
        {
          name: body.name,
          providerId: body.providerId,
          credentials: body.credentials,
        },
        request.ip,
        request.headers['user-agent'],
      );
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.get('/', { preHandler: [authenticate] }, async (_request: FastifyRequest, _reply: FastifyReply) => {
    const providers = await listProviderConfigs();
    return { providers };
  });

  app.get('/:id', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const config = await getProviderConfig(id);
    if (!config) {
      return reply.status(404).send({ error: '服务商配置不存在' });
    }
    return config;
  });

  app.put('/:id', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    try {
      const result = await updateProviderConfig(
        request.user!.userId,
        id,
        {
          name: body?.name,
          credentials: body?.credentials,
          enabled: body?.enabled,
        },
        request.ip,
        request.headers['user-agent'],
      );
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.delete('/:id', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const confirmed = request.headers['x-confirm-delete'] === 'true';
    try {
      const result = await deleteProviderConfig(
        request.user!.userId,
        id,
        confirmed,
        request.ip,
        request.headers['user-agent'],
      );
      if (result.success) {
        await triggerNotification('dns_provider.deleted', {
          title: 'DNS 服务商配置已删除',
          content: `DNS 服务商配置已被删除`,
          level: 'warning' as const,
        });
      }
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post('/:id/test', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    try {
      const result = await testProviderConnection(id);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post('/:id/sync', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    try {
      const result = await syncProviderDomains(
        request.user!.userId,
        id,
        request.ip,
        request.headers['user-agent'],
      );
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
