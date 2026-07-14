import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, requireRole } from '../middleware/auth.js';
import { requireDomainAccess } from '../middleware/domain-permission.js';
import {
  getUptimePushUrl,
  configureUptimePushUrl,
  removeUptimePushUrl,
  getUptimeStatus,
  manualHealthCheck,
} from '../services/uptime.js';

export async function uptimeRoutes(app: FastifyInstance) {
  app.post('/configure', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { pushUrl?: string };
    if (!body?.pushUrl) {
      return reply.status(400).send({ error: '缺少 pushUrl 参数' });
    }
    try {
      const result = await configureUptimePushUrl(body.pushUrl);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.get('/configure', { preHandler: [authenticate, requireRole('admin')] }, async (_request: FastifyRequest, _reply: FastifyReply) => {
    const pushUrl = await getUptimePushUrl();
    return { configured: !!pushUrl, pushUrl: pushUrl || null };
  });

  app.delete('/configure', { preHandler: [authenticate, requireRole('admin')] }, async (_request: FastifyRequest, _reply: FastifyReply) => {
    const result = await removeUptimePushUrl();
    return result;
  });

  app.get('/status/:domainId', { preHandler: [authenticate, requireDomainAccess('domainId')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { domainId } = request.params as { domainId: string };
    try {
      const status = await getUptimeStatus(domainId);
      return status;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post('/check/:domainId', { preHandler: [authenticate, requireDomainAccess('domainId')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { domainId } = request.params as { domainId: string };
    try {
      const result = await manualHealthCheck(domainId);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
