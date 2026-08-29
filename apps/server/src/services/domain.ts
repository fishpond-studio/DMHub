import { eq, and, ilike, sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { insertReturningOne } from '../db/helpers.js';
import {
  domains,
  dnsRecords,
  providerConfigs,
  domainAssignments,
  domainAssignmentRequests,
} from '../db/schema.js';
import { lookupDomainExpiry } from '../lib/whois.js';
import { logOperation } from '../lib/log.js';

export async function listDomains(
  userId: string,
  role: string,
  filters?: { search?: string; status?: string; group?: string },
) {
  const db = getDb();

  const conditions = [];

  if (role !== 'admin') {
    const assignedDomainIds = await db
      .select({ domainId: domainAssignments.domainId })
      .from(domainAssignments)
      .where(eq(domainAssignments.userId, userId));
    const allowedIds = assignedDomainIds.map((a: { domainId: string }) => a.domainId);
    if (allowedIds.length === 0) return [];
    conditions.push(sql`${domains.id} IN (${sql.join(allowedIds.map((id: string) => sql`${id}`), sql`,`)})`);
  }

  if (filters?.search) {
    conditions.push(ilike(domains.name, `%${filters.search}%`));
  }
  if (filters?.status) {
    conditions.push(eq(domains.status, filters.status));
  }
  if (filters?.group) {
    conditions.push(eq(domains.groupName, filters.group));
  }

  const whereClause = conditions.length > 0
    ? sql`${sql.join(conditions.map((c) => sql`(${c})`), sql` AND `)}`
    : undefined;

  const rows = await db
    .select({
      id: domains.id,
      name: domains.name,
      providerId: domains.providerId,
      providerConfigId: domains.providerConfigId,
      expiresAt: domains.expiresAt,
      tags: domains.tags,
      groupName: domains.groupName,
      status: domains.status,
      createdAt: domains.createdAt,
      updatedAt: domains.updatedAt,
      providerConfigName: providerConfigs.name,
      recordCount: sql<number>`(SELECT COUNT(*) FROM ${dnsRecords} WHERE ${dnsRecords.domainId} = ${domains.id})`,
    })
    .from(domains)
    .leftJoin(providerConfigs, eq(domains.providerConfigId, providerConfigs.id))
    .where(whereClause);

  const mapped = rows.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    name: r.name as string,
    providerId: r.providerId,
    providerConfigId: r.providerConfigId,
    providerName: r.providerConfigName,
    expiresAt: r.expiresAt,
    tags: r.tags,
    groupName: r.groupName,
    status: r.status as string,
    recordCount: Number(r.recordCount),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    assignments: [] as Array<{ id: string; subdomainPattern: string; permission: string }>,
  }));

  // 非管理员附带指派范围，避免用户只看到总域名却不知道能管哪些子域
  if (role !== 'admin' && mapped.length > 0) {
    const domainIds: string[] = mapped.map((d: { id: string }) => d.id);
    const assignmentRows = await db
      .select({
        id: domainAssignments.id,
        domainId: domainAssignments.domainId,
        subdomainPattern: domainAssignments.subdomainPattern,
        permission: domainAssignments.permission,
      })
      .from(domainAssignments)
      .where(
        and(
          eq(domainAssignments.userId, userId),
          sql`${domainAssignments.domainId} IN (${sql.join(domainIds.map((id: string) => sql`${id}`), sql`,`)})`,
        ),
      );

    const byDomain = new Map<string, Array<{ id: string; subdomainPattern: string; permission: string }>>();
    for (const a of assignmentRows as Array<{ id: string; domainId: string; subdomainPattern: string; permission: string }>) {
      if (!byDomain.has(a.domainId)) byDomain.set(a.domainId, []);
      byDomain.get(a.domainId)!.push({
        id: a.id,
        subdomainPattern: a.subdomainPattern,
        permission: a.permission,
      });
    }
    for (const d of mapped) {
      d.assignments = byDomain.get(d.id) ?? [];
    }
  }

  return mapped;
}

export async function createDomain(
  userId: string,
  input: { name: string; providerConfigId?: string; expiresAt?: string; tags?: string[]; groupName?: string },
  ipAddress?: string,
  userAgent?: string,
) {
  const db = getDb();

  if (input.providerConfigId) {
    const [config] = await db
      .select({ id: providerConfigs.id })
      .from(providerConfigs)
      .where(eq(providerConfigs.id, input.providerConfigId))
      .limit(1);
    if (!config) {
      throw new Error('服务商配置不存在');
    }
  }

  const insertData: typeof domains.$inferInsert = {
    name: input.name,
    status: 'active',
  };
  if (input.providerConfigId) insertData.providerConfigId = input.providerConfigId;
  if (input.expiresAt) insertData.expiresAt = new Date(input.expiresAt);
  if (input.tags) insertData.tags = input.tags;
  if (input.groupName) insertData.groupName = input.groupName;

  const domain = await insertReturningOne<{
    id: string;
    name: string;
    providerId: string | null;
    providerConfigId: string | null;
    providerDomainId: string | null;
    expiresAt: Date | null;
    tags: string[] | null;
    groupName: string | null;
    status: string;
    autoCheckExpiry: boolean;
    createdAt: Date;
    updatedAt: Date;
  }>(domains, insertData, {
    id: domains.id,
    name: domains.name,
    providerId: domains.providerId,
    providerConfigId: domains.providerConfigId,
    providerDomainId: domains.providerDomainId,
    expiresAt: domains.expiresAt,
    tags: domains.tags,
    groupName: domains.groupName,
    status: domains.status,
    autoCheckExpiry: domains.autoCheckExpiry,
    createdAt: domains.createdAt,
    updatedAt: domains.updatedAt,
  });

  await logOperation({
    userId,
    domainId: domain.id,
    action: 'domain.add',
    targetType: 'domain',
    targetId: domain.id,
    detail: { name: input.name, providerConfigId: input.providerConfigId },
    ipAddress,
    userAgent,
  });

  return domain;
}

export async function deleteDomain(
  userId: string,
  domainId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const db = getDb();

  const [domain] = await db
    .select({
      id: domains.id,
      name: domains.name,
      providerConfigId: domains.providerConfigId,
    })
    .from(domains)
    .where(eq(domains.id, domainId))
    .limit(1);

  if (!domain) {
    throw new Error('域名不存在');
  }

  await db.delete(dnsRecords).where(eq(dnsRecords.domainId, domainId));
  await db.delete(domainAssignments).where(eq(domainAssignments.domainId, domainId));
  await db.delete(domainAssignmentRequests).where(eq(domainAssignmentRequests.domainId, domainId));
  await db.delete(domains).where(eq(domains.id, domainId));

  await logOperation({
    userId,
    domainId,
    action: 'domain.delete',
    targetType: 'domain',
    targetId: domainId,
    detail: { name: domain.name },
    ipAddress,
    userAgent,
  });

  return { success: true, deleted: domain };
}

export async function getDomain(domainId: string, userId: string, role: string) {
  const db = getDb();

  const [row] = await db
    .select({
      id: domains.id,
      name: domains.name,
      providerId: domains.providerId,
      providerConfigId: domains.providerConfigId,
      providerDomainId: domains.providerDomainId,
      expiresAt: domains.expiresAt,
      tags: domains.tags,
      groupName: domains.groupName,
      status: domains.status,
      autoCheckExpiry: domains.autoCheckExpiry,
      expiryRemindDays: domains.expiryRemindDays,
      lastCheckedAt: domains.lastCheckedAt,
      notes: domains.notes,
      sslExpiresAt: domains.sslExpiresAt,
      sslLastCheckedAt: domains.sslLastCheckedAt,
      sslIssuer: domains.sslIssuer,
      monitorEnabled: domains.monitorEnabled,
      monitorStatus: domains.monitorStatus,
      monitorResponseMs: domains.monitorResponseMs,
      monitorLastCheckedAt: domains.monitorLastCheckedAt,
      createdAt: domains.createdAt,
      updatedAt: domains.updatedAt,
      providerConfigName: providerConfigs.name,
    })
    .from(domains)
    .leftJoin(providerConfigs, eq(domains.providerConfigId, providerConfigs.id))
    .where(eq(domains.id, domainId))
    .limit(1);

  if (!row) return null;

  const [recordCountRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(dnsRecords)
    .where(eq(dnsRecords.domainId, domainId));

  let assignmentInfo = null;
  let assignmentsList: Array<{ id: string; permission: string; subdomainPattern: string }> = [];
  if (role !== 'admin') {
    assignmentsList = await db
      .select({
        id: domainAssignments.id,
        permission: domainAssignments.permission,
        subdomainPattern: domainAssignments.subdomainPattern,
      })
      .from(domainAssignments)
      .where(
        and(
          eq(domainAssignments.userId, userId),
          eq(domainAssignments.domainId, domainId),
        ),
      );
    // 兼容旧前端：保留单条 assignment，优先返回可编辑指派
    assignmentInfo =
      assignmentsList.find((a) => a.permission === 'dns_edit') ??
      assignmentsList[0] ??
      null;
  }

  // 解析真实 providerId（domains.providerId 可能为空，以 config 为准）
  let resolvedProviderId = (row.providerId as string | null) || null;
  if (!resolvedProviderId && row.providerConfigId) {
    const [cfg] = await db
      .select({ providerId: providerConfigs.providerId })
      .from(providerConfigs)
      .where(eq(providerConfigs.id, row.providerConfigId as string))
      .limit(1);
    resolvedProviderId = cfg?.providerId ?? null;
  }

  let cdnProxy: {
    supported: boolean;
    proxyRecordTypes: string[];
    proxyLabel: string;
    proxyDescription: string;
  } = {
    supported: false,
    proxyRecordTypes: [],
    proxyLabel: 'CDN 保护',
    proxyDescription: '当前服务商不支持 DNS 层 CDN 代理',
  };
  try {
    const { getProviderCapabilities } = await import('@dmhub/dns-providers');
    const caps = getProviderCapabilities(resolvedProviderId);
    cdnProxy = {
      supported: caps.supportsProxy,
      proxyRecordTypes: caps.proxyRecordTypes,
      proxyLabel: caps.proxyLabel,
      proxyDescription: caps.proxyDescription,
    };
  } catch {
    // package 不可用时保持默认
  }

  return {
    ...row,
    providerId: resolvedProviderId,
    providerName: row.providerConfigName,
    recordCount: Number(recordCountRow?.count ?? 0),
    assignment: assignmentInfo,
    assignments: assignmentsList,
    cdnProxy,
  };
}

export async function updateDomainNotes(domainId: string, notes: string | null) {
  const db = getDb();
  const [existing] = await db.select({ id: domains.id }).from(domains).where(eq(domains.id, domainId)).limit(1);
  if (!existing) throw new Error('域名不存在');
  const value = notes?.trim() ? notes.trim().slice(0, 4000) : null;
  await db.update(domains).set({ notes: value, updatedAt: new Date() }).where(eq(domains.id, domainId));
  const [updated] = await db
    .select({ id: domains.id, notes: domains.notes })
    .from(domains)
    .where(eq(domains.id, domainId))
    .limit(1);
  return updated;
}

export async function searchDnsRecords(
  userId: string,
  role: string,
  query: string,
  limit = 50,
) {
  const q = query.trim();
  if (!q || q.length < 1) return { results: [] as const };
  const db = getDb();
  const take = Math.min(Math.max(limit, 1), 100);

  let allowedDomainIds: string[] | null = null;
  if (role !== 'admin') {
    const assigned = await db
      .select({ domainId: domainAssignments.domainId })
      .from(domainAssignments)
      .where(eq(domainAssignments.userId, userId));
    allowedDomainIds = assigned.map((a: { domainId: string }) => a.domainId) as string[];
    if (!allowedDomainIds || allowedDomainIds.length === 0) return { results: [] };
  }

  const like = `%${q.replace(/[%_]/g, '\\$&')}%`;
  // lower()+LIKE 跨 PG/MySQL 可用（避免 ILIKE）；含备注与精确 IP/值反查
  const dialectSafe = [
    sql`(
      LOWER(${dnsRecords.name}) LIKE LOWER(${like})
      OR LOWER(${dnsRecords.value}) LIKE LOWER(${like})
      OR LOWER(${dnsRecords.recordType}) LIKE LOWER(${like})
      OR LOWER(${domains.name}) LIKE LOWER(${like})
      OR LOWER(COALESCE(${dnsRecords.notes}, '')) LIKE LOWER(${like})
      OR LOWER(${dnsRecords.value}) = LOWER(${q})
    )`,
  ];
  if (allowedDomainIds) {
    dialectSafe.push(
      sql`${dnsRecords.domainId} IN (${sql.join(
        allowedDomainIds.map((id: string) => sql`${id}`),
        sql`, `,
      )})`,
    );
  }

  const rows = await db
    .select({
      id: dnsRecords.id,
      domainId: dnsRecords.domainId,
      domainName: domains.name,
      recordType: dnsRecords.recordType,
      name: dnsRecords.name,
      value: dnsRecords.value,
      ttl: dnsRecords.ttl,
      priority: dnsRecords.priority,
      proxied: dnsRecords.proxied,
      notes: dnsRecords.notes,
    })
    .from(dnsRecords)
    .innerJoin(domains, eq(dnsRecords.domainId, domains.id))
    .where(sql`${sql.join(dialectSafe.map((c) => sql`(${c})`), sql` AND `)}`)
    .limit(take);

  // 精确值匹配（反查 IP）排前
  const qLower = q.toLowerCase();
  const sorted = [...rows].sort((a: { value: string }, b: { value: string }) => {
    const ae = a.value?.toLowerCase() === qLower ? 0 : 1;
    const be = b.value?.toLowerCase() === qLower ? 0 : 1;
    return ae - be;
  });

  return {
    results: sorted.map((r: Record<string, unknown>) => ({
      ...r,
      fqdn:
        !r.name || r.name === '@'
          ? r.domainName
          : `${r.name}.${r.domainName}`,
    })),
  };
}

/** 检测域名 HTTPS 证书并缓存到期信息 */
export async function checkDomainSsl(domainId: string, hostname?: string) {
  const { checkSslCertificate } = await import('../lib/ssl-check.js');
  const db = getDb();
  const [domain] = await db
    .select({ id: domains.id, name: domains.name })
    .from(domains)
    .where(eq(domains.id, domainId))
    .limit(1);
  if (!domain) throw new Error('域名不存在');

  const host = (hostname || domain.name).trim().toLowerCase();
  const result = await checkSslCertificate(host, 443);

  if (result.success && result.expiresAt) {
    await db
      .update(domains)
      .set({
        sslExpiresAt: new Date(result.expiresAt),
        sslLastCheckedAt: new Date(),
        sslIssuer: result.issuer?.slice(0, 255) || null,
        updatedAt: new Date(),
      })
      .where(eq(domains.id, domainId));
  } else {
    await db
      .update(domains)
      .set({
        sslLastCheckedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(domains.id, domainId));
  }

  return result;
}

export async function updateExpiryRemind(
  domainId: string,
  input: { expiryRemindDays?: number[]; autoCheckExpiry?: boolean },
) {
  const db = getDb();

  const [existing] = await db.select({ id: domains.id }).from(domains).where(eq(domains.id, domainId)).limit(1);
  if (!existing) {
    throw new Error('域名不存在');
  }

  const updateData: Record<string, any> = { updatedAt: new Date() };
  if (input.expiryRemindDays !== undefined) {
  if (!input.expiryRemindDays.includes(0)) {
    input.expiryRemindDays = [...input.expiryRemindDays, 0];
  }
    updateData.expiryRemindDays = input.expiryRemindDays;
  }
  if (input.autoCheckExpiry !== undefined) {
    updateData.autoCheckExpiry = input.autoCheckExpiry;
  }

  await db.update(domains).set(updateData).where(eq(domains.id, domainId));

  const [updated] = await db.select({
    id: domains.id,
    autoCheckExpiry: domains.autoCheckExpiry,
    expiryRemindDays: domains.expiryRemindDays,
  }).from(domains).where(eq(domains.id, domainId)).limit(1);

  return updated;
}

export async function checkDomainExpiry(
  userId: string,
  domainId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const db = getDb();

  const [domain] = await db.select({
    id: domains.id,
    name: domains.name,
    expiresAt: domains.expiresAt,
  }).from(domains).where(eq(domains.id, domainId)).limit(1);

  if (!domain) {
    throw new Error('域名不存在');
  }

  const result = await lookupDomainExpiry(domain.name);

  if (!result.expiresAt) {
    throw new Error(
      '无法查询到该域名的到期时间（RDAP/WHOIS 均无结果）。' +
        '常见原因：注册局限流、隐私保护未公开到期日、或暂不支持该后缀。请稍后重试或手动设置。',
    );
  }

  await db.update(domains).set({
    expiresAt: new Date(result.expiresAt),
    lastCheckedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(domains.id, domainId));

  await logOperation({
    userId,
    domainId,
    action: 'domain.expiry_check',
    targetType: 'domain',
    targetId: domainId,
    detail: { domain: domain.name, expiresAt: result.expiresAt, registrar: result.registrar },
    ipAddress,
    userAgent,
  });

  const [updated] = await db.select({
    id: domains.id,
    name: domains.name,
    expiresAt: domains.expiresAt,
    lastCheckedAt: domains.lastCheckedAt,
  }).from(domains).where(eq(domains.id, domainId)).limit(1);

  return {
    ...updated,
    registrar: result.registrar,
  };
}

export async function updateDomainExpiry(
  userId: string,
  domainId: string,
  expiresAt: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const db = getDb();

  const [domain] = await db.select({ id: domains.id, name: domains.name })
    .from(domains).where(eq(domains.id, domainId)).limit(1);

  if (!domain) {
    throw new Error('域名不存在');
  }

  await db.update(domains).set({
    expiresAt: new Date(expiresAt),
    lastCheckedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(domains.id, domainId));

  await logOperation({
    userId,
    domainId,
    action: 'domain.expiry_update',
    targetType: 'domain',
    targetId: domainId,
    detail: { domain: domain.name, expiresAt },
    ipAddress,
    userAgent,
  });

  const [updated] = await db.select({
    id: domains.id,
    expiresAt: domains.expiresAt,
    lastCheckedAt: domains.lastCheckedAt,
  }).from(domains).where(eq(domains.id, domainId)).limit(1);

  return updated;
}
