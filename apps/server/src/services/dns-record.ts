import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { dnsRecords, domains, providerConfigs } from '../db/schema.js';
import { insertReturningOne } from '../db/helpers.js';
import { getAdapter, getProviderCapabilities } from '@dmhub/dns-providers';
import type { Credentials, CreateRecordInput, UpdateRecordInput } from '@dmhub/dns-providers';
import { decryptCredentials } from '../lib/credential-encryption.js';
import { logOperation } from '../lib/log.js';
import { createSnapshot } from './snapshot.js';
import { matchesAnyPattern } from '../lib/subdomain-match.js';
import { triggerNotification } from './notification.js';

const recordSelect = {
  id: dnsRecords.id,
  domainId: dnsRecords.domainId,
  recordType: dnsRecords.recordType,
  name: dnsRecords.name,
  value: dnsRecords.value,
  ttl: dnsRecords.ttl,
  priority: dnsRecords.priority,
  proxied: dnsRecords.proxied,
  providerRecordId: dnsRecords.providerRecordId,
  snapshotVersion: dnsRecords.snapshotVersion,
  status: dnsRecords.status,
  notes: dnsRecords.notes,
  createdAt: dnsRecords.createdAt,
  updatedAt: dnsRecords.updatedAt,
};

async function notifyRecordChange(
  event: 'record.created' | 'record.updated' | 'record.deleted',
  domainId: string,
  detail: Record<string, unknown>,
) {
  try {
    const db = getDb();
    const [domain] = await db
      .select({ name: domains.name })
      .from(domains)
      .where(eq(domains.id, domainId))
      .limit(1);
    const domainName = domain?.name || domainId;
    const type = String(detail.recordType || '');
    const name = String(detail.name || '');
    const titles: Record<string, string> = {
      'record.created': `DNS 记录已创建: ${type} ${name}`,
      'record.updated': `DNS 记录已更新: ${type} ${name}`,
      'record.deleted': `DNS 记录已删除: ${type} ${name}`,
    };
    await triggerNotification(event, {
      title: titles[event],
      content: `域名 ${domainName} · ${type} ${name}${detail.value ? ` → ${detail.value}` : ''}`,
      level: event === 'record.deleted' ? 'warning' : 'info',
      metadata: { domainId, domainName, ...detail },
    });
  } catch (err) {
    console.error('[dns-record] notify failed:', err);
  }
}

export async function listRecords(
  domainId: string,
  filters?: { type?: string; search?: string },
  patterns?: string[],
) {
  const db = getDb();

  const conditions = [eq(dnsRecords.domainId, domainId)];

  if (filters?.type) {
    conditions.push(eq(dnsRecords.recordType, filters.type));
  }
  if (filters?.search) {
    const like = `%${filters.search.replace(/[%_]/g, '\\$&')}%`;
    conditions.push(
      sql`(
        LOWER(${dnsRecords.name}) LIKE LOWER(${like})
        OR LOWER(${dnsRecords.value}) LIKE LOWER(${like})
        OR LOWER(COALESCE(${dnsRecords.notes}, '')) LIKE LOWER(${like})
      )`,
    );
  }

  const rows = await db
    .select(recordSelect)
    .from(dnsRecords)
    .where(and(...conditions));

  if (patterns && patterns.length > 0) {
    return rows.filter((r: { name: string }) => matchesAnyPattern(r.name, patterns));
  }
  return rows;
}

async function getProviderForDomain(domainId: string) {
  const db = getDb();

  const [domain] = await db
    .select({
      id: domains.id,
      providerConfigId: domains.providerConfigId,
      providerDomainId: domains.providerDomainId,
    })
    .from(domains)
    .where(eq(domains.id, domainId))
    .limit(1);

  if (!domain || !domain.providerConfigId) return null;

  const [config] = await db
    .select({
      providerId: providerConfigs.providerId,
      credentials: providerConfigs.credentials,
    })
    .from(providerConfigs)
    .where(eq(providerConfigs.id, domain.providerConfigId))
    .limit(1);

  if (!config) return null;

  const adapter = getAdapter(config.providerId);
  if (!adapter) return null;

  const decryptedCreds = decryptCredentials(config.providerId, config.credentials as Record<string, string>) as Credentials;

  return {
    adapter,
    credentials: decryptedCreds,
    providerDomainId: domain.providerDomainId,
    providerId: config.providerId as string,
  };
}

/** 规范化 proxied：仅当服务商 + 记录类型支持 CDN 时保留 true */
function normalizeProxied(
  providerId: string | null | undefined,
  recordType: string,
  proxied?: boolean,
): boolean {
  if (!proxied) return false;
  const caps = getProviderCapabilities(providerId);
  if (!caps.supportsProxy) return false;
  if (!caps.proxyRecordTypes.includes(recordType.toUpperCase())) return false;
  return true;
}

export async function createRecord(
  userId: string,
  domainId: string,
  input: {
    recordType: string;
    name: string;
    value: string;
    ttl?: number;
    priority?: number;
    proxied?: boolean;
    notes?: string | null;
  },
  ipAddress?: string,
  userAgent?: string,
) {
  let providerRecordId: string | null = null;
  const provider = await getProviderForDomain(domainId);
  const proxied = normalizeProxied(
    provider?.providerId,
    input.recordType,
    input.proxied,
  );

  if (provider) {
    const recordInput: CreateRecordInput = {
      type: input.recordType,
      name: input.name,
      value: input.value,
      ttl: input.ttl ?? 3600,
      priority: input.priority,
      proxied,
    };
    const providerRecord = await provider.adapter.createRecord(
      provider.credentials,
      provider.providerDomainId ?? domainId,
      recordInput,
    );
    providerRecordId = providerRecord.id;
  }

  const notes = input.notes?.trim() ? input.notes.trim().slice(0, 1000) : null;

  const record = await insertReturningOne(
    dnsRecords,
    {
      domainId,
      recordType: input.recordType,
      name: input.name,
      value: input.value,
      ttl: input.ttl ?? 3600,
      priority: input.priority ?? null,
      proxied,
      providerRecordId,
      notes,
    },
    recordSelect,
  );

  await logOperation({
    userId,
    domainId,
    action: 'record.create',
    targetType: 'dns_record',
    targetId: record.id,
    detail: { recordType: input.recordType, name: input.name, value: input.value, notes },
    ipAddress,
    userAgent,
  });

  try { await createSnapshot(domainId, userId, 'on_change'); } catch (err) { console.error('Failed to create snapshot:', err); }

  void notifyRecordChange('record.created', domainId, {
    recordType: input.recordType,
    name: input.name,
    value: input.value,
    recordId: record.id,
  });

  return record;
}

export async function updateRecord(
  userId: string,
  domainId: string,
  recordId: string,
  input: {
    recordType?: string;
    name?: string;
    value?: string;
    ttl?: number;
    priority?: number;
    proxied?: boolean;
    notes?: string | null;
  },
  ipAddress?: string,
  userAgent?: string,
) {
  const db = getDb();

  const [existing] = await db
    .select({
      id: dnsRecords.id,
      providerRecordId: dnsRecords.providerRecordId,
      recordType: dnsRecords.recordType,
      name: dnsRecords.name,
      value: dnsRecords.value,
    })
    .from(dnsRecords)
    .where(and(eq(dnsRecords.id, recordId), eq(dnsRecords.domainId, domainId)))
    .limit(1);

  if (!existing) {
    throw new Error('DNS记录不存在');
  }

  const provider = await getProviderForDomain(domainId);
  const nextType = input.recordType || existing.recordType;
  let nextProxied: boolean | undefined;
  if (input.proxied !== undefined) {
    nextProxied = normalizeProxied(provider?.providerId, nextType, input.proxied);
  }

  if (existing.providerRecordId && provider) {
    const updateInput: UpdateRecordInput = {};
    if (input.recordType) updateInput.type = input.recordType;
    if (input.name) updateInput.name = input.name;
    if (input.value) updateInput.value = input.value;
    if (input.ttl !== undefined) updateInput.ttl = input.ttl;
    if (input.priority !== undefined) updateInput.priority = input.priority;
    if (nextProxied !== undefined) updateInput.proxied = nextProxied;

    await provider.adapter.updateRecord(
      provider.credentials,
      provider.providerDomainId ?? domainId,
      existing.providerRecordId,
      updateInput,
    );
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (input.recordType) updateData.recordType = input.recordType;
  if (input.name) updateData.name = input.name;
  if (input.value) updateData.value = input.value;
  if (input.ttl !== undefined) updateData.ttl = input.ttl;
  if (input.priority !== undefined) updateData.priority = input.priority;
  if (nextProxied !== undefined) updateData.proxied = nextProxied;
  if (input.notes !== undefined) {
    updateData.notes = input.notes?.trim() ? input.notes.trim().slice(0, 1000) : null;
  }

  await db
    .update(dnsRecords)
    .set(updateData)
    .where(and(eq(dnsRecords.id, recordId), eq(dnsRecords.domainId, domainId)));

  const [updated] = await db
    .select(recordSelect)
    .from(dnsRecords)
    .where(eq(dnsRecords.id, recordId))
    .limit(1);

  await logOperation({
    userId,
    domainId,
    action: 'record.update',
    targetType: 'dns_record',
    targetId: recordId,
    detail: input,
    ipAddress,
    userAgent,
  });

  try { await createSnapshot(domainId, userId, 'on_change'); } catch (err) { console.error('Failed to create snapshot:', err); }

  void notifyRecordChange('record.updated', domainId, {
    recordType: updated?.recordType || existing.recordType,
    name: updated?.name || existing.name,
    value: updated?.value || existing.value,
    recordId,
  });

  return updated;
}

export async function deleteRecord(
  userId: string,
  domainId: string,
  recordId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const db = getDb();

  const [existing] = await db
    .select({
      id: dnsRecords.id,
      providerRecordId: dnsRecords.providerRecordId,
      recordType: dnsRecords.recordType,
      name: dnsRecords.name,
    })
    .from(dnsRecords)
    .where(and(eq(dnsRecords.id, recordId), eq(dnsRecords.domainId, domainId)))
    .limit(1);

  if (!existing) {
    throw new Error('DNS记录不存在');
  }

  if (existing.providerRecordId) {
    const provider = await getProviderForDomain(domainId);
    if (provider) {
      await provider.adapter.deleteRecord(
        provider.credentials,
        provider.providerDomainId ?? domainId,
        existing.providerRecordId,
      );
    }
  }

  await db
    .delete(dnsRecords)
    .where(and(eq(dnsRecords.id, recordId), eq(dnsRecords.domainId, domainId)));

  await logOperation({
    userId,
    domainId,
    action: 'record.delete',
    targetType: 'dns_record',
    targetId: recordId,
    detail: { recordType: existing.recordType, name: existing.name },
    ipAddress,
    userAgent,
  });

  try { await createSnapshot(domainId, userId, 'on_change'); } catch (err) { console.error('Failed to create snapshot:', err); }

  void notifyRecordChange('record.deleted', domainId, {
    recordType: existing.recordType,
    name: existing.name,
    recordId,
  });

  return { success: true };
}

/** 批量更新 TTL（及可选 proxied） */
export async function bulkUpdateRecords(
  userId: string,
  domainId: string,
  recordIds: string[],
  patch: { ttl?: number; proxied?: boolean },
  ipAddress?: string,
  userAgent?: string,
) {
  if (!recordIds.length) {
    return { total: 0, succeeded: 0, failed: 0, results: [] as Array<{ id: string; success: boolean; error?: string }> };
  }
  if (recordIds.length > 100) {
    throw new Error('单次批量更新最多 100 条记录');
  }
  if (patch.ttl === undefined && patch.proxied === undefined) {
    throw new Error('至少需要提供 ttl 或 proxied');
  }
  if (patch.ttl !== undefined) {
    const ttl = Number(patch.ttl);
    if (!Number.isFinite(ttl) || ttl < 1 || ttl > 86400 * 7) {
      throw new Error('TTL 须在 1～604800 秒之间');
    }
    patch.ttl = Math.floor(ttl);
  }

  const results: Array<{ id: string; success: boolean; error?: string }> = [];
  for (const recordId of recordIds) {
    try {
      await updateRecord(userId, domainId, recordId, patch, ipAddress, userAgent);
      results.push({ id: recordId, success: true });
    } catch (err: unknown) {
      results.push({
        id: recordId,
        success: false,
        error: err instanceof Error ? err.message : '更新失败',
      });
    }
  }

  await logOperation({
    userId,
    domainId,
    action: 'record.bulk_update',
    targetType: 'domain',
    targetId: domainId,
    detail: {
      patch,
      total: results.length,
      succeeded: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    },
    ipAddress,
    userAgent,
  });

  return {
    total: results.length,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  };
}

/** 批量删除记录 */
export async function bulkDeleteRecords(
  userId: string,
  domainId: string,
  recordIds: string[],
  ipAddress?: string,
  userAgent?: string,
) {
  if (!recordIds.length) {
    return { total: 0, succeeded: 0, failed: 0, results: [] as Array<{ id: string; success: boolean; error?: string }> };
  }
  if (recordIds.length > 100) {
    throw new Error('单次批量删除最多 100 条记录');
  }

  const results: Array<{ id: string; success: boolean; error?: string }> = [];
  for (const recordId of recordIds) {
    try {
      await deleteRecord(userId, domainId, recordId, ipAddress, userAgent);
      results.push({ id: recordId, success: true });
    } catch (err: unknown) {
      results.push({
        id: recordId,
        success: false,
        error: err instanceof Error ? err.message : '删除失败',
      });
    }
  }

  await logOperation({
    userId,
    domainId,
    action: 'record.bulk_delete',
    targetType: 'domain',
    targetId: domainId,
    detail: {
      total: results.length,
      succeeded: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    },
    ipAddress,
    userAgent,
  });

  return {
    total: results.length,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  };
}

export async function syncRecords(
  userId: string,
  domainId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const db = getDb();

  const provider = await getProviderForDomain(domainId);
  if (!provider) {
    throw new Error('该域名未关联 DNS 服务商，无法同步');
  }

  const providerRecords = await provider.adapter.listRecords(
    provider.credentials,
    provider.providerDomainId ?? domainId,
  );

  let synced = 0;
  let created = 0;
  let updated = 0;

  const providerRecordIds = providerRecords.map((pr) => pr.id).filter((id): id is string => !!id);
  const existingRecords = providerRecordIds.length > 0
    ? await db
        .select({ id: dnsRecords.id, providerRecordId: dnsRecords.providerRecordId })
        .from(dnsRecords)
        .where(and(eq(dnsRecords.domainId, domainId)))
    : [];

  const existingByProviderId = new Map<string, string>();
  for (const rec of existingRecords) {
    if (rec.providerRecordId) {
      existingByProviderId.set(rec.providerRecordId, rec.id);
    }
  }

  for (const pr of providerRecords) {
    const existingId = pr.id ? existingByProviderId.get(pr.id) : undefined;

    if (existingId) {
      await db
        .update(dnsRecords)
        .set({
          recordType: pr.type,
          name: pr.name,
          value: pr.value,
          ttl: pr.ttl,
          priority: pr.priority ?? null,
          proxied: pr.proxied ?? false,
          updatedAt: new Date(),
        })
        .where(eq(dnsRecords.id, existingId));
      updated++;
    } else {
      await db.insert(dnsRecords).values({
        domainId,
        recordType: pr.type,
        name: pr.name,
        value: pr.value,
        ttl: pr.ttl,
        priority: pr.priority ?? null,
        proxied: pr.proxied ?? false,
        providerRecordId: pr.id ?? null,
      });
      created++;
    }
    synced++;
  }

  await logOperation({
    userId,
    domainId,
    action: 'record.sync',
    targetType: 'domain',
    targetId: domainId,
    detail: { synced, created, updated },
    ipAddress,
    userAgent,
  });

  return { synced, created, updated };
}
