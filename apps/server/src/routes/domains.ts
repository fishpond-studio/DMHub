import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, requireRole } from '../middleware/auth.js';
import { requireDomainAccess, requireDomainWriteAccess, requireRecordWriteAccess } from '../middleware/domain-permission.js';
import {
  listDomains,
  createDomain,
  deleteDomain,
  getDomain,
  updateExpiryRemind,
  checkDomainExpiry,
  updateDomainExpiry,
  updateDomainNotes,
  searchDnsRecords,
  checkDomainSsl,
} from '../services/domain.js';
import { previewDomainExpiry } from '../lib/whois.js';
import {
  listRecords,
  createRecord,
  updateRecord,
  deleteRecord,
  syncRecords,
  bulkUpdateRecords,
  bulkDeleteRecords,
} from '../services/dns-record.js';
import { checkDnsPropagation, buildFqdn } from '../lib/dns-check.js';
import { getDb } from '../db/index.js';
import { domains, dnsRecords } from '../db/schema.js';
import { eq, sql, and } from 'drizzle-orm';
import { createDnsRecordSchema } from '@dmhub/shared';

export async function domainRoutes(app: FastifyInstance) {
  /** 全局 DNS 搜索（主机/值/类型/域名） */
  app.get('/search/records', { preHandler: [authenticate] }, async (request: FastifyRequest) => {
    const query = request.query as { q?: string; limit?: string };
    return searchDnsRecords(
      request.user!.userId,
      request.user!.role,
      query.q || '',
      query.limit ? Number(query.limit) : 50,
    );
  });

  /** 管理员：批量 WHOIS 到期检查 */
  app.post('/check-expiry-batch', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest) => {
    const body = request.body as { domainIds?: string[]; limit?: number };
    const db = getDb();
    let ids = body?.domainIds;
    if (!ids || ids.length === 0) {
      const rows = await db
        .select({ id: domains.id })
        .from(domains)
        .where(eq(domains.autoCheckExpiry, true))
        .limit(Math.min(body?.limit || 20, 50));
      ids = rows.map((r: { id: string }) => r.id);
    } else {
      ids = ids.slice(0, 50);
    }

    const results: Array<{
      domainId: string;
      name?: string;
      success: boolean;
      expiresAt?: string | null;
      error?: string;
    }> = [];

    for (const id of ids ?? []) {
      try {
        const r = await checkDomainExpiry(
          request.user!.userId,
          id,
          request.ip,
          request.headers['user-agent'],
        );
        results.push({
          domainId: id,
          name: r.name,
          success: true,
          expiresAt: r.expiresAt ? new Date(r.expiresAt as Date).toISOString() : null,
        });
      } catch (err: any) {
        const [d] = await db.select({ name: domains.name }).from(domains).where(eq(domains.id, id)).limit(1);
        results.push({
          domainId: id,
          name: d?.name,
          success: false,
          error: err.message || '查询失败',
        });
      }
    }

    return {
      total: results.length,
      succeeded: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  });

  app.post('/check-expiry-preview', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as any;
    if (!body?.domain) {
      return reply.status(400).send({ error: '缺少 domain 字段' });
    }
    try {
      const result = await previewDomainExpiry(body.domain);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.get('/groups', { preHandler: [authenticate] }, async () => {
    const db = getDb();
    const rows = await db
      .select({
        name: domains.groupName,
        count: sql<number>`COUNT(*)`,
      })
      .from(domains)
      .where(sql`${domains.groupName} IS NOT NULL`)
      .groupBy(domains.groupName);
    return { groups: rows.filter((r: { name: string }) => r.name).map((r: { name: string; count: number }) => ({ name: r.name, count: Number(r.count) })) };
  });

  app.get('/tags', { preHandler: [authenticate] }, async () => {
    const db = getDb();
    const rows = await db
      .select({ tags: domains.tags })
      .from(domains);
    const tagCounts: Record<string, number> = {};
    for (const row of rows as Array<{ tags: string[] | null }>) {
      if (row.tags) {
        for (const tag of row.tags) {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
      }
    }
    return { tags: Object.entries(tagCounts).map(([name, count]: [string, number]) => ({ name, count })).sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)) };
  });

  app.get('/', { preHandler: [authenticate] }, async (request: FastifyRequest) => {
    const query = request.query as { search?: string; status?: string; group?: string };
    const domains = await listDomains(request.user!.userId, request.user!.role, query);
    return { domains };
  });

  app.post('/', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as any;
    if (!body?.name) {
      return reply.status(400).send({ error: '缺少必要字段: name' });
    }
    try {
      const domain = await createDomain(
        request.user!.userId,
        {
          name: body.name,
          providerConfigId: body.providerConfigId,
          expiresAt: body.expiresAt,
          tags: body.tags,
          groupName: body.groupName,
        },
        request.ip,
        request.headers['user-agent'],
      );
      return domain;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.delete('/:id', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    try {
      const result = await deleteDomain(request.user!.userId, id, request.ip, request.headers['user-agent']);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.get('/:id', { preHandler: [authenticate, requireDomainAccess('id')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const domain = await getDomain(id, request.user!.userId, request.user!.role);
    if (!domain) {
      return reply.status(404).send({ error: '域名不存在' });
    }
    return domain;
  });

  app.put('/:id/tags', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { tags?: string[] };
    if (!body || !Array.isArray(body.tags)) {
      return reply.status(400).send({ error: 'tags 必须是字符串数组' });
    }
    const db = getDb();
    await db.update(domains).set({ tags: body.tags, updatedAt: new Date() }).where(eq(domains.id, id));
    const [updated] = await db.select({ id: domains.id, tags: domains.tags }).from(domains).where(eq(domains.id, id)).limit(1);
    return updated;
  });

  app.put('/:id/group', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { groupName?: string };
    if (body.groupName === undefined) {
      return reply.status(400).send({ error: '缺少 groupName 字段' });
    }
    const db = getDb();
    await db.update(domains).set({ groupName: body.groupName || null, updatedAt: new Date() }).where(eq(domains.id, id));
    const [updated] = await db.select({ id: domains.id, groupName: domains.groupName }).from(domains).where(eq(domains.id, id)).limit(1);
    return updated;
  });

  app.put('/:id/notes', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { notes?: string | null };
    try {
      return await updateDomainNotes(id, body?.notes ?? null);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.get('/:id/records', { preHandler: [authenticate, requireDomainAccess('id')] }, async (request: FastifyRequest) => {
    const { id } = request.params as { id: string };
    const query = request.query as { type?: string; search?: string };
    const patterns = request.user!.role === 'admin'
      ? undefined
      : (request.domainAssignments ?? []).map((a) => a.subdomainPattern);
    const records = await listRecords(id, query, patterns);
    return { records };
  });

  app.post('/:id/records', { preHandler: [authenticate, requireDomainWriteAccess('id'), requireRecordWriteAccess({ domainIdParam: 'id' })] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    if (!body?.recordType || !body?.name || !body?.value) {
      return reply.status(400).send({ error: '缺少必要字段: recordType, name, value' });
    }
    try {
      const record = await createRecord(
        request.user!.userId,
        id,
        {
          recordType: body.recordType,
          name: body.name,
          value: body.value,
          ttl: body.ttl,
          priority: body.priority,
          proxied: body.proxied,
          notes: body.notes,
        },
        request.ip,
        request.headers['user-agent'],
      );
      return record;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.put('/:id/records/:recordId', { preHandler: [authenticate, requireDomainWriteAccess('id'), requireRecordWriteAccess({ domainIdParam: 'id', recordIdParam: 'recordId' })] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, recordId } = request.params as { id: string; recordId: string };
    const body = request.body as any;
    try {
      const record = await updateRecord(
        request.user!.userId,
        id,
        recordId,
        {
          recordType: body?.recordType,
          name: body?.name,
          value: body?.value,
          ttl: body?.ttl,
          priority: body?.priority,
          proxied: body?.proxied,
          notes: body?.notes,
        },
        request.ip,
        request.headers['user-agent'],
      );
      return record;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  /** 多公共 DNS 解析传播检测 */
  app.post('/:id/records/:recordId/propagate', { preHandler: [authenticate, requireDomainAccess('id')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, recordId } = request.params as { id: string; recordId: string };
    try {
      const db = getDb();
      const [domain] = await db.select({ name: domains.name }).from(domains).where(eq(domains.id, id)).limit(1);
      if (!domain) return reply.status(404).send({ error: '域名不存在' });
      const [record] = await db
        .select({
          recordType: dnsRecords.recordType,
          name: dnsRecords.name,
          value: dnsRecords.value,
        })
        .from(dnsRecords)
        .where(and(eq(dnsRecords.id, recordId), eq(dnsRecords.domainId, id)))
        .limit(1);
      if (!record) return reply.status(404).send({ error: '记录不存在' });

      const body = (request.body || {}) as { expectedValue?: string };
      const fqdn = buildFqdn(domain.name, record.name);
      return await checkDnsPropagation({
        fqdn,
        recordType: record.recordType,
        expectedValue: body.expectedValue ?? record.value,
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  /** 任意主机传播检测（可不依赖已有记录） */
  app.post('/:id/dns-check', { preHandler: [authenticate, requireDomainAccess('id')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { name?: string; recordType?: string; expectedValue?: string; fqdn?: string };
    try {
      const db = getDb();
      const [domain] = await db.select({ name: domains.name }).from(domains).where(eq(domains.id, id)).limit(1);
      if (!domain) return reply.status(404).send({ error: '域名不存在' });
      const fqdn = body.fqdn || buildFqdn(domain.name, body.name || '@');
      return await checkDnsPropagation({
        fqdn,
        recordType: body.recordType || 'A',
        expectedValue: body.expectedValue,
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  /** HTTPS 证书检测 */
  app.post('/:id/ssl-check', { preHandler: [authenticate, requireDomainAccess('id')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = (request.body || {}) as { hostname?: string };
    try {
      return await checkDomainSsl(id, body.hostname);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.delete('/:id/records/:recordId', { preHandler: [authenticate, requireDomainWriteAccess('id'), requireRecordWriteAccess({ domainIdParam: 'id', recordIdParam: 'recordId' })] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, recordId } = request.params as { id: string; recordId: string };
    try {
      const result = await deleteRecord(request.user!.userId, id, recordId, request.ip, request.headers['user-agent']);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post('/:id/sync', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    try {
      const result = await syncRecords(request.user!.userId, id, request.ip, request.headers['user-agent']);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.put('/:id/expiry-remind', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    try {
      const result = await updateExpiryRemind(id, {
        expiryRemindDays: body?.expiryRemindDays,
        autoCheckExpiry: body?.autoCheckExpiry,
      });
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post('/:id/check-expiry', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    try {
      const result = await checkDomainExpiry(
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

  app.post('/:id/records/bulk', { preHandler: [authenticate, requireDomainWriteAccess('id'), requireRecordWriteAccess({ domainIdParam: 'id' })] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { records?: Array<{ recordType: string; name: string; value: string; ttl?: number; priority?: number; proxied?: boolean }> };

    if (!body?.records || !Array.isArray(body.records) || body.records.length === 0) {
      return reply.status(400).send({ error: 'records 必须是非空数组' });
    }

    if (body.records.length > 100) {
      return reply.status(400).send({ error: '单次批量操作最多100条记录' });
    }

    const results: Array<{ success: boolean; recordType?: string; name?: string; error?: string }> = [];

    for (const input of body.records) {
      const parsed = createDnsRecordSchema.safeParse(input);
      if (!parsed.success) {
        const errMsg = parsed.error.errors.map((e) => e.message).join('; ');
        results.push({ success: false, recordType: input.recordType, name: input.name, error: errMsg });
        continue;
      }

      try {
        const record = await createRecord(
          request.user!.userId,
          id,
          {
            recordType: parsed.data.recordType,
            name: parsed.data.name,
            value: parsed.data.value,
            ttl: parsed.data.ttl,
            priority: parsed.data.priority,
            proxied: parsed.data.proxied,
          },
          request.ip,
          request.headers['user-agent'],
        );
        results.push({ success: true, recordType: record.recordType, name: record.name });
      } catch (err: unknown) {
        results.push({
          success: false,
          recordType: input.recordType,
          name: input.name,
          error: err instanceof Error ? err.message : '创建失败',
        });
      }
    }

    return { results, total: results.length, succeeded: results.filter((r) => r.success).length };
  });

  /** 批量更新记录（TTL / 代理） */
  app.post('/:id/records/bulk-update', { preHandler: [authenticate, requireDomainWriteAccess('id'), requireRecordWriteAccess({ domainIdParam: 'id' })] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { recordIds?: string[]; ttl?: number; proxied?: boolean };
    if (!body?.recordIds || !Array.isArray(body.recordIds) || body.recordIds.length === 0) {
      return reply.status(400).send({ error: 'recordIds 必须是非空数组' });
    }
    try {
      return await bulkUpdateRecords(
        request.user!.userId,
        id,
        body.recordIds,
        { ttl: body.ttl, proxied: body.proxied },
        request.ip,
        request.headers['user-agent'],
      );
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  /** 批量删除记录 */
  app.post('/:id/records/bulk-delete', { preHandler: [authenticate, requireDomainWriteAccess('id'), requireRecordWriteAccess({ domainIdParam: 'id' })] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { recordIds?: string[] };
    if (!body?.recordIds || !Array.isArray(body.recordIds) || body.recordIds.length === 0) {
      return reply.status(400).send({ error: 'recordIds 必须是非空数组' });
    }
    try {
      return await bulkDeleteRecords(
        request.user!.userId,
        id,
        body.recordIds,
        request.ip,
        request.headers['user-agent'],
      );
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.put('/:id/expiry', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    if (!body?.expiresAt) {
      return reply.status(400).send({ error: '缺少 expiresAt 字段' });
    }
    try {
      const result = await updateDomainExpiry(
        request.user!.userId,
        id,
        body.expiresAt,
        request.ip,
        request.headers['user-agent'],
      );
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
