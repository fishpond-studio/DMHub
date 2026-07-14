import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { apiKeyAuth, requireApiKeyPermission } from '../middleware/api-key.js';
import { listDomains, getDomain } from '../services/domain.js';
import { listRecords, createRecord, updateRecord, deleteRecord } from '../services/dns-record.js';
import { getDb } from '../db/index.js';
import { domains } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export async function openApiRoutes(app: FastifyInstance) {
  app.get('/domains', { preHandler: [apiKeyAuth, requireApiKeyPermission('domains:read')] }, async (_request: FastifyRequest) => {
    const allDomains = await listDomains('', 'admin');
    return { domains: allDomains };
  });

  app.get('/domains/:id', { preHandler: [apiKeyAuth, requireApiKeyPermission('domains:read')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const domain = await getDomain(id, '', 'admin');
    if (!domain) {
      return reply.status(404).send({ error: '域名不存在' });
    }
    return domain;
  });

  app.get('/domains/:id/records', { preHandler: [apiKeyAuth, requireApiKeyPermission('records:read')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const [domain] = await db
      .select({ id: domains.id })
      .from(domains)
      .where(eq(domains.id, id))
      .limit(1);
    if (!domain) {
      return reply.status(404).send({ error: '域名不存在' });
    }
    const records = await listRecords(id);
    return { records };
  });

  app.post('/domains/:id/records', { preHandler: [apiKeyAuth, requireApiKeyPermission('records:write')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    if (!body?.recordType || !body?.name || !body?.value) {
      return reply.status(400).send({ error: '缺少必要字段: recordType, name, value' });
    }
    try {
      const record = await createRecord(
        request.apiKeyInfo!.keyId,
        id,
        {
          recordType: body.recordType,
          name: body.name,
          value: body.value,
          ttl: body.ttl,
          priority: body.priority,
          proxied: body.proxied,
        },
        request.ip,
        request.headers['user-agent'],
      );
      return record;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.put('/domains/:id/records/:recordId', { preHandler: [apiKeyAuth, requireApiKeyPermission('records:write')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, recordId } = request.params as { id: string; recordId: string };
    const body = request.body as any;
    try {
      const record = await updateRecord(
        request.apiKeyInfo!.keyId,
        id,
        recordId,
        {
          recordType: body?.recordType,
          name: body?.name,
          value: body?.value,
          ttl: body?.ttl,
          priority: body?.priority,
          proxied: body?.proxied,
        },
        request.ip,
        request.headers['user-agent'],
      );
      return record;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.delete('/domains/:id/records/:recordId', { preHandler: [apiKeyAuth, requireApiKeyPermission('records:write')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, recordId } = request.params as { id: string; recordId: string };
    try {
      const result = await deleteRecord(
        request.apiKeyInfo!.keyId,
        id,
        recordId,
        request.ip,
        request.headers['user-agent'],
      );
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
