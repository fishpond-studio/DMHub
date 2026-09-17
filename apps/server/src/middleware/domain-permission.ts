import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, inArray } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { domainAssignments, dnsRecords } from '../db/schema.js';
import { matchesAnyPattern } from '../lib/subdomain-match.js';

declare module 'fastify' {
  interface FastifyRequest {
    domainAssignments?: Array<{ subdomainPattern: string; permission: string }>;
  }
}

async function loadAssignments(userId: string, domainId: string) {
  const db = getDb();
  return db
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
}

export function requireDomainAccess(domainIdParam: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({ error: '未认证' });
    }

    if (request.user.role === 'admin') return;

    const params = request.params as Record<string, string>;
    const domainId = params[domainIdParam];
    if (!domainId) {
      return reply.status(400).send({ error: '缺少域名ID参数' });
    }

    const assignments = await loadAssignments(request.user.userId, domainId);
    if (assignments.length === 0) {
      return reply.status(403).send({ error: '无权访问该域名' });
    }
    request.domainAssignments = assignments;
  };
}

export function requireDomainWriteAccess(domainIdParam: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({ error: '未认证' });
    }

    if (request.user.role === 'admin') return;

    const params = request.params as Record<string, string>;
    const domainId = params[domainIdParam];
    if (!domainId) {
      return reply.status(400).send({ error: '缺少域名ID参数' });
    }

    const assignments = await loadAssignments(request.user.userId, domainId);
    if (assignments.length === 0) {
      return reply.status(403).send({ error: '无权访问该域名' });
    }

    const writable = assignments.filter((a: { permission: string }) => a.permission === 'dns_edit');
    if (writable.length === 0) {
      return reply.status(403).send({ error: '仅有只读权限，无法执行此操作' });
    }
    request.domainAssignments = writable;
  };
}

/**
 * 在解析记录写操作中校验目标记录名是否落在用户被指派的 subdomainPattern 范围内。
 *
 * 调用时机：请求体里有 record name 时（创建/更新），从 body.name 取；
 * 如果是 update/delete 已有记录的接口，会从 db 读 dnsRecords.name 兜底。
 * admin 直接放行。
 */
export function requireRecordWriteAccess(opts: { domainIdParam: string; recordIdParam?: string }) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({ error: '未认证' });
    }
    if (request.user.role === 'admin') return;

    const params = request.params as Record<string, string>;
    const domainId = params[opts.domainIdParam];
    if (!domainId) {
      return reply.status(400).send({ error: '缺少域名ID参数' });
    }

    const writable = (request.domainAssignments ?? []).filter((a: { permission: string }) => a.permission === 'dns_edit');
    if (writable.length === 0) {
      return reply.status(403).send({ error: '无权操作该域名的解析记录' });
    }
    const patterns = writable.map((a: { subdomainPattern: string }) => a.subdomainPattern);

    const namesToCheck: string[] = [];

    const body = (request.body ?? {}) as { name?: unknown; recordIds?: unknown };
    if (typeof body.name === 'string') {
      namesToCheck.push(body.name);
    }

    // 批量操作防护：校验批量 recordIds 对应的所有解析记录均落在权限子域名范围内
    if (Array.isArray(body.recordIds) && body.recordIds.length > 0) {
      const db = getDb();
      const stringIds = body.recordIds.filter((id): id is string => typeof id === 'string');
      if (stringIds.length > 0) {
        const matchingRecords = await db
          .select({ id: dnsRecords.id, name: dnsRecords.name })
          .from(dnsRecords)
          .where(and(inArray(dnsRecords.id, stringIds), eq(dnsRecords.domainId, domainId)));

        if (matchingRecords.length !== stringIds.length) {
          return reply.status(404).send({ error: '部分待操作记录不存在或不属于该域名' });
        }
        for (const rec of matchingRecords) {
          namesToCheck.push(rec.name);
        }
      }
    }

    if (opts.recordIdParam) {
      const recordId = params[opts.recordIdParam];
      if (recordId) {
        const db = getDb();
        const [existing] = await db
          .select({ name: dnsRecords.name })
          .from(dnsRecords)
          .where(and(eq(dnsRecords.id, recordId), eq(dnsRecords.domainId, domainId)))
          .limit(1);
        if (!existing) {
          return reply.status(404).send({ error: 'DNS记录不存在' });
        }
        namesToCheck.push(existing.name);
      }
    }

    if (namesToCheck.length === 0) {
      return reply.status(400).send({ error: '缺少记录名参数' });
    }

    for (const name of namesToCheck) {
      if (!matchesAnyPattern(name, patterns)) {
        return reply.status(403).send({
          error: `无权操作记录 "${name}"：该记录不在您被指派的子域名范围内`,
        });
      }
    }
  };
}
