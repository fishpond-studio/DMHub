import { eq, and, ilike } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { dnsRecords, domains, providerConfigs } from '../db/schema.js';
import { insertReturningOne } from '../db/helpers.js';
import { getAdapter } from '@dmhub/dns-providers';
import type { Credentials, CreateRecordInput, UpdateRecordInput } from '@dmhub/dns-providers';
import { decryptCredentials } from '../lib/credential-encryption.js';
import { logOperation } from '../lib/log.js';
import { createSnapshot } from './snapshot.js';
import { matchesAnyPattern } from '../lib/subdomain-match.js';

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
    conditions.push(ilike(dnsRecords.name, `%${filters.search}%`));
  }

  const rows = await db
    .select({
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
      createdAt: dnsRecords.createdAt,
      updatedAt: dnsRecords.updatedAt,
    })
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
  };
}

export async function createRecord(
  userId: string,
  domainId: string,
  input: { recordType: string; name: string; value: string; ttl?: number; priority?: number; proxied?: boolean },
  ipAddress?: string,
  userAgent?: string,
) {
  let providerRecordId: string | null = null;

  const provider = await getProviderForDomain(domainId);
  if (provider) {
    const recordInput: CreateRecordInput = {
      type: input.recordType,
      name: input.name,
      value: input.value,
      ttl: input.ttl ?? 3600,
      priority: input.priority,
      proxied: input.proxied,
    };
    const providerRecord = await provider.adapter.createRecord(
      provider.credentials,
      provider.providerDomainId ?? domainId,
      recordInput,
    );
    providerRecordId = providerRecord.id;
  }

  const record = await insertReturningOne(
    dnsRecords,
    {
      domainId,
      recordType: input.recordType,
      name: input.name,
      value: input.value,
      ttl: input.ttl ?? 3600,
      priority: input.priority ?? null,
      proxied: input.proxied ?? false,
      providerRecordId,
    },
    {
      id: dnsRecords.id,
      domainId: dnsRecords.domainId,
      recordType: dnsRecords.recordType,
      name: dnsRecords.name,
      value: dnsRecords.value,
      ttl: dnsRecords.ttl,
      priority: dnsRecords.priority,
      proxied: dnsRecords.proxied,
      providerRecordId: dnsRecords.providerRecordId,
      status: dnsRecords.status,
      createdAt: dnsRecords.createdAt,
      updatedAt: dnsRecords.updatedAt,
    },
  );

  await logOperation({
    userId,
    domainId,
    action: 'record.create',
    targetType: 'dns_record',
    targetId: record.id,
    detail: { recordType: input.recordType, name: input.name, value: input.value },
    ipAddress,
    userAgent,
  });

  try { await createSnapshot(domainId, userId, 'on_change'); } catch (err) { console.error('Failed to create snapshot:', err); }

  return record;
}

export async function updateRecord(
  userId: string,
  domainId: string,
  recordId: string,
  input: { recordType?: string; name?: string; value?: string; ttl?: number; priority?: number; proxied?: boolean },
  ipAddress?: string,
  userAgent?: string,
) {
  const db = getDb();

  const [existing] = await db
    .select({
      id: dnsRecords.id,
      providerRecordId: dnsRecords.providerRecordId,
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
      const updateInput: UpdateRecordInput = {};
      if (input.recordType) updateInput.type = input.recordType;
      if (input.name) updateInput.name = input.name;
      if (input.value) updateInput.value = input.value;
      if (input.ttl !== undefined) updateInput.ttl = input.ttl;
      if (input.priority !== undefined) updateInput.priority = input.priority;
      if (input.proxied !== undefined) updateInput.proxied = input.proxied;

      await provider.adapter.updateRecord(
        provider.credentials,
        provider.providerDomainId ?? domainId,
        existing.providerRecordId,
        updateInput,
      );
    }
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (input.recordType) updateData.recordType = input.recordType;
  if (input.name) updateData.name = input.name;
  if (input.value) updateData.value = input.value;
  if (input.ttl !== undefined) updateData.ttl = input.ttl;
  if (input.priority !== undefined) updateData.priority = input.priority;
  if (input.proxied !== undefined) updateData.proxied = input.proxied;

  await db
    .update(dnsRecords)
    .set(updateData)
    .where(and(eq(dnsRecords.id, recordId), eq(dnsRecords.domainId, domainId)));

  const [updated] = await db
    .select({
      id: dnsRecords.id,
      domainId: dnsRecords.domainId,
      recordType: dnsRecords.recordType,
      name: dnsRecords.name,
      value: dnsRecords.value,
      ttl: dnsRecords.ttl,
      priority: dnsRecords.priority,
      proxied: dnsRecords.proxied,
      providerRecordId: dnsRecords.providerRecordId,
      status: dnsRecords.status,
      createdAt: dnsRecords.createdAt,
      updatedAt: dnsRecords.updatedAt,
    })
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

  return { success: true };
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
