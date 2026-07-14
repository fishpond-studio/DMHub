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

  return rows.map((r: Record<string, unknown>) => ({
    id: r.id,
    name: r.name,
    providerId: r.providerId,
    providerConfigId: r.providerConfigId,
    providerName: r.providerConfigName,
    expiresAt: r.expiresAt,
    tags: r.tags,
    groupName: r.groupName,
    status: r.status,
    recordCount: Number(r.recordCount),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
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
  if (role !== 'admin') {
    const [assignment] = await db
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
      )
      .limit(1);
    assignmentInfo = assignment ?? null;
  }

  return {
    ...row,
    providerName: row.providerConfigName,
    recordCount: Number(recordCountRow?.count ?? 0),
    assignment: assignmentInfo,
  };
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
    throw new Error('无法查询到该域名的到期时间，请手动设置');
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
