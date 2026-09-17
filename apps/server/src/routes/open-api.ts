import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { apiKeyAuth, requireApiKeyPermission } from '../middleware/api-key.js';
import { listDomains, getDomain } from '../services/domain.js';
import { listRecords, createRecord, updateRecord, deleteRecord } from '../services/dns-record.js';
import { getDb } from '../db/index.js';
import { domains, domainAssignments, dnsRecords } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { matchesAnyPattern } from '../lib/subdomain-match.js';

async function checkUserDomainAccess(
  userId: string,
  userRole: string,
  domainId: string,
  requireWrite = false,
): Promise<{ allowed: boolean; patterns?: string[]; error?: string }> {
  if (userRole === 'admin') {
    return { allowed: true, patterns: ['*'] };
  }

  const db = getDb();
  const assignments = await db
    .select({
      subdomainPattern: domainAssignments.subdomainPattern,
      permission: domainAssignments.permission,
    })
    .from(domainAssignments)
    .where(
      and(
        eq(domainAssignments.userId, userId),
        eq(domainAssignments.domainId, domainId),
      ),
    );

  if (assignments.length === 0) {
    return { allowed: false, error: '无权访问该域名' };
  }

  if (requireWrite) {
    const writable = assignments.filter((a: { permission: string }) => a.permission === 'dns_edit');
    if (writable.length === 0) {
      return { allowed: false, error: '仅有只读权限，无法修改此域名的解析记录' };
    }
    return { allowed: true, patterns: writable.map((w: { subdomainPattern: string }) => w.subdomainPattern) };
  }

  return { allowed: true, patterns: assignments.map((a: { subdomainPattern: string }) => a.subdomainPattern) };
}

export async function openApiRoutes(app: FastifyInstance) {
  app.get('/domains', { preHandler: [apiKeyAuth, requireApiKeyPermission('domains:read')] }, async (request: FastifyRequest) => {
    const userId = request.apiKeyInfo?.userId || '';
    const userRole = request.apiKeyInfo?.userRole || (request.apiKeyInfo?.userId ? 'user' : 'admin');
    const allDomains = await listDomains(userId, userRole);
    return { domains: allDomains };
  });

  app.get('/domains/:id', { preHandler: [apiKeyAuth, requireApiKeyPermission('domains:read')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const userId = request.apiKeyInfo?.userId || '';
    const userRole = request.apiKeyInfo?.userRole || (request.apiKeyInfo?.userId ? 'user' : 'admin');

    const access = await checkUserDomainAccess(userId, userRole, id, false);
    if (!access.allowed) {
      return reply.status(403).send({ error: access.error });
    }

    const domain = await getDomain(id, userId, userRole);
    if (!domain) {
      return reply.status(404).send({ error: '域名不存在' });
    }
    return domain;
  });

  app.get('/domains/:id/records', { preHandler: [apiKeyAuth, requireApiKeyPermission('records:read')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const userId = request.apiKeyInfo?.userId || '';
    const userRole = request.apiKeyInfo?.userRole || (request.apiKeyInfo?.userId ? 'user' : 'admin');

    const access = await checkUserDomainAccess(userId, userRole, id, false);
    if (!access.allowed) {
      return reply.status(403).send({ error: access.error });
    }

    const db = getDb();
    const [domain] = await db
      .select({ id: domains.id })
      .from(domains)
      .where(eq(domains.id, id))
      .limit(1);
    if (!domain) {
      return reply.status(404).send({ error: '域名不存在' });
    }

    const records = await listRecords(id, undefined, userRole === 'admin' ? undefined : access.patterns);
    return { records };
  });

  app.post('/domains/:id/records', { preHandler: [apiKeyAuth, requireApiKeyPermission('records:write')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    if (!body?.recordType || !body?.name || !body?.value) {
      return reply.status(400).send({ error: '缺少必要字段: recordType, name, value' });
    }

    const userId = request.apiKeyInfo?.userId || '';
    const userRole = request.apiKeyInfo?.userRole || (request.apiKeyInfo?.userId ? 'user' : 'admin');

    const access = await checkUserDomainAccess(userId, userRole, id, true);
    if (!access.allowed) {
      return reply.status(403).send({ error: access.error });
    }

    if (userRole !== 'admin' && access.patterns && !matchesAnyPattern(body.name, access.patterns)) {
      return reply.status(403).send({ error: `无权操作记录 "${body.name}"：该记录不在您被指派的子域名范围内` });
    }

    try {
      const record = await createRecord(
        userId || request.apiKeyInfo!.keyId,
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

    const userId = request.apiKeyInfo?.userId || '';
    const userRole = request.apiKeyInfo?.userRole || (request.apiKeyInfo?.userId ? 'user' : 'admin');

    const access = await checkUserDomainAccess(userId, userRole, id, true);
    if (!access.allowed) {
      return reply.status(403).send({ error: access.error });
    }

    const db = getDb();
    const [existing] = await db
      .select({ name: dnsRecords.name })
      .from(dnsRecords)
      .where(and(eq(dnsRecords.id, recordId), eq(dnsRecords.domainId, id)))
      .limit(1);

    if (!existing) {
      return reply.status(404).send({ error: 'DNS记录不存在' });
    }

    if (userRole !== 'admin' && access.patterns) {
      if (!matchesAnyPattern(existing.name, access.patterns)) {
        return reply.status(403).send({ error: `无权操作原记录 "${existing.name}"` });
      }
      if (body?.name && !matchesAnyPattern(body.name, access.patterns)) {
        return reply.status(403).send({ error: `无权将记录更新为 "${body.name}"：不在指派子域名范围内` });
      }
    }

    try {
      const record = await updateRecord(
        userId || request.apiKeyInfo!.keyId,
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

    const userId = request.apiKeyInfo?.userId || '';
    const userRole = request.apiKeyInfo?.userRole || (request.apiKeyInfo?.userId ? 'user' : 'admin');

    const access = await checkUserDomainAccess(userId, userRole, id, true);
    if (!access.allowed) {
      return reply.status(403).send({ error: access.error });
    }

    const db = getDb();
    const [existing] = await db
      .select({ name: dnsRecords.name })
      .from(dnsRecords)
      .where(and(eq(dnsRecords.id, recordId), eq(dnsRecords.domainId, id)))
      .limit(1);

    if (!existing) {
      return reply.status(404).send({ error: 'DNS记录不存在' });
    }

    if (userRole !== 'admin' && access.patterns && !matchesAnyPattern(existing.name, access.patterns)) {
      return reply.status(403).send({ error: `无权删除记录 "${existing.name}"：不在指派子域名范围内` });
    }

    try {
      const result = await deleteRecord(
        userId || request.apiKeyInfo!.keyId,
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
