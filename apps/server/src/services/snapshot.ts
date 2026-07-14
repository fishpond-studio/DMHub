import { eq, and, desc, sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { dnsSnapshots, dnsRecords, domains, providerConfigs } from '../db/schema.js';
import { getAdapter } from '@dmhub/dns-providers';
import type { Credentials, CreateRecordInput, UpdateRecordInput } from '@dmhub/dns-providers';
import { decryptCredentials } from '../lib/credential-encryption.js';
import { logOperation } from '../lib/log.js';
import { matchesAnyPattern } from '../lib/subdomain-match.js';
import { insertReturningOne } from '../db/helpers.js';

export interface SnapshotRecord {
  recordType: string;
  name: string;
  value: string;
  ttl: number;
  priority: number | null;
  proxied: boolean;
}

export async function createSnapshot(
  domainId: string,
  userId: string | null,
  trigger: 'manual' | 'scheduled' | 'on_change' = 'manual',
) {
  const db = getDb();

  const currentRecords = await db
    .select({
      recordType: dnsRecords.recordType,
      name: dnsRecords.name,
      value: dnsRecords.value,
      ttl: dnsRecords.ttl,
      priority: dnsRecords.priority,
      proxied: dnsRecords.proxied,
    })
    .from(dnsRecords)
    .where(eq(dnsRecords.domainId, domainId));

  const [maxVersionRow] = await db
    .select({ version: sql<number>`COALESCE(MAX(${dnsSnapshots.version}), 0)` })
    .from(dnsSnapshots)
    .where(eq(dnsSnapshots.domainId, domainId));

  const version = (maxVersionRow?.version ?? 0) + 1;

  const snapshot = await insertReturningOne(
    dnsSnapshots,
    {
      domainId,
      version,
      records: currentRecords,
      trigger,
      createdBy: userId,
    },
    {
      id: dnsSnapshots.id,
      domainId: dnsSnapshots.domainId,
      version: dnsSnapshots.version,
      trigger: dnsSnapshots.trigger,
      createdBy: dnsSnapshots.createdBy,
      createdAt: dnsSnapshots.createdAt,
    },
  );

  return snapshot;
}

export async function listSnapshots(domainId: string) {
  const db = getDb();

  const snapshots = await db
    .select({
      id: dnsSnapshots.id,
      domainId: dnsSnapshots.domainId,
      version: dnsSnapshots.version,
      trigger: dnsSnapshots.trigger,
      createdBy: dnsSnapshots.createdBy,
      createdAt: dnsSnapshots.createdAt,
    })
    .from(dnsSnapshots)
    .where(eq(dnsSnapshots.domainId, domainId))
    .orderBy(desc(dnsSnapshots.version));

  return snapshots;
}

export async function getSnapshot(domainId: string, snapshotId: string, patterns?: string[]) {
  const db = getDb();

  const [snapshot] = await db
    .select()
    .from(dnsSnapshots)
    .where(and(eq(dnsSnapshots.domainId, domainId), eq(dnsSnapshots.id, snapshotId)))
    .limit(1);

  if (!snapshot) return null;
  if (patterns && patterns.length > 0) {
    const records = (snapshot.records as SnapshotRecord[]).filter((r) =>
      matchesAnyPattern(r.name, patterns),
    );
    return { ...snapshot, records };
  }
  return snapshot;
}

function recordKey(r: SnapshotRecord) {
  return `${r.recordType}:${r.name}`;
}

function recordDetailKey(r: SnapshotRecord) {
  return `${r.recordType}:${r.name}:${r.value}`;
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

export async function rollbackSnapshot(
  userId: string,
  domainId: string,
  snapshotId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const db = getDb();

  const snapshot = await getSnapshot(domainId, snapshotId);
  if (!snapshot) {
    throw new Error('快照不存在');
  }

  await createSnapshot(domainId, userId, 'on_change');

  const snapshotRecords = snapshot.records as SnapshotRecord[];

  const currentRecords = await db
    .select({
      id: dnsRecords.id,
      recordType: dnsRecords.recordType,
      name: dnsRecords.name,
      value: dnsRecords.value,
      ttl: dnsRecords.ttl,
      priority: dnsRecords.priority,
      proxied: dnsRecords.proxied,
      providerRecordId: dnsRecords.providerRecordId,
    })
    .from(dnsRecords)
    .where(eq(dnsRecords.domainId, domainId));

  const currentByDetail = new Map<string, typeof currentRecords[number]>();
  for (const r of currentRecords) {
    currentByDetail.set(recordDetailKey(r), r);
  }

  const snapshotByDetail = new Map<string, SnapshotRecord>();
  for (const r of snapshotRecords) {
    snapshotByDetail.set(recordDetailKey(r), r);
  }

  let deleted = 0;
  let created = 0;
  let updated = 0;

  const provider = await getProviderForDomain(domainId);

  for (const [key, record] of currentByDetail) {
    if (!snapshotByDetail.has(key)) {
      if (record.providerRecordId && provider) {
        try {
          await provider.adapter.deleteRecord(provider.credentials, provider.providerDomainId ?? domainId, record.providerRecordId);
        } catch (err) { console.error('Failed to delete provider record during rollback:', err); }
      }
      await db.delete(dnsRecords).where(eq(dnsRecords.id, record.id));
      deleted++;
    }
  }

  for (const [key, record] of snapshotByDetail) {
    if (!currentByDetail.has(key)) {
      let providerRecordId: string | null = null;
      if (provider) {
        try {
          const input: CreateRecordInput = {
            type: record.recordType,
            name: record.name,
            value: record.value,
            ttl: record.ttl,
            priority: record.priority ?? undefined,
            proxied: record.proxied,
          };
          const result = await provider.adapter.createRecord(provider.credentials, provider.providerDomainId ?? domainId, input);
          providerRecordId = result.id;
        } catch (err) { console.error('Failed to create provider record during rollback:', err); }
      }
      await db.insert(dnsRecords).values({
        domainId,
        recordType: record.recordType,
        name: record.name,
        value: record.value,
        ttl: record.ttl,
        priority: record.priority ?? null,
        proxied: record.proxied,
        providerRecordId,
      });
      created++;
    }
  }

  for (const [key, snapshotRec] of snapshotByDetail) {
    const currentRec = currentByDetail.get(key);
    if (currentRec && (
      currentRec.ttl !== snapshotRec.ttl ||
      currentRec.priority !== snapshotRec.priority ||
      currentRec.proxied !== snapshotRec.proxied
    )) {
      if (currentRec.providerRecordId && provider) {
        try {
          const updateInput: UpdateRecordInput = {
            ttl: snapshotRec.ttl,
            priority: snapshotRec.priority ?? undefined,
            proxied: snapshotRec.proxied,
          };
          await provider.adapter.updateRecord(provider.credentials, provider.providerDomainId ?? domainId, currentRec.providerRecordId, updateInput);
        } catch (err) { console.error('Failed to update provider record during rollback:', err); }
      }
      await db.update(dnsRecords)
        .set({
          ttl: snapshotRec.ttl,
          priority: snapshotRec.priority ?? null,
          proxied: snapshotRec.proxied,
          updatedAt: new Date(),
        })
        .where(eq(dnsRecords.id, currentRec.id));
      updated++;
    }
  }

  await logOperation({
    userId,
    domainId,
    action: 'snapshot.rollback',
    targetType: 'dns_snapshot',
    targetId: snapshotId,
    detail: { version: snapshot.version, deleted, created, updated },
    ipAddress,
    userAgent,
  });

  return { deleted, created, updated };
}

function getChanges(before: SnapshotRecord, after: SnapshotRecord) {
  const changes: Record<string, [any, any]> = {};
  if (before.value !== after.value) changes.value = [before.value, after.value];
  if (before.ttl !== after.ttl) changes.ttl = [before.ttl, after.ttl];
  if (before.priority !== after.priority) changes.priority = [before.priority, after.priority];
  if (before.proxied !== after.proxied) changes.proxied = [before.proxied, after.proxied];
  return Object.keys(changes).length > 0 ? changes : null;
}

export async function diffSnapshots(
  domainId: string,
  fromVersion: number,
  toVersion: number,
  patterns?: string[],
) {
  const db = getDb();

  const [fromSnapshot] = await db
    .select()
    .from(dnsSnapshots)
    .where(and(eq(dnsSnapshots.domainId, domainId), eq(dnsSnapshots.version, fromVersion)))
    .limit(1);

  const [toSnapshot] = await db
    .select()
    .from(dnsSnapshots)
    .where(and(eq(dnsSnapshots.domainId, domainId), eq(dnsSnapshots.version, toVersion)))
    .limit(1);

  if (!fromSnapshot) throw new Error('源快照不存在');
  if (!toSnapshot) throw new Error('目标快照不存在');

  let fromRecords = fromSnapshot.records as SnapshotRecord[];
  let toRecords = toSnapshot.records as SnapshotRecord[];

  if (patterns && patterns.length > 0) {
    fromRecords = fromRecords.filter((r) => matchesAnyPattern(r.name, patterns));
    toRecords = toRecords.filter((r) => matchesAnyPattern(r.name, patterns));
  }

  const fromByGroup = new Map<string, SnapshotRecord[]>();
  for (const r of fromRecords) {
    const k = recordKey(r);
    if (!fromByGroup.has(k)) fromByGroup.set(k, []);
    fromByGroup.get(k)!.push(r);
  }

  const toByGroup = new Map<string, SnapshotRecord[]>();
  for (const r of toRecords) {
    const k = recordKey(r);
    if (!toByGroup.has(k)) toByGroup.set(k, []);
    toByGroup.get(k)!.push(r);
  }

  const added: SnapshotRecord[] = [];
  const removed: SnapshotRecord[] = [];
  const modified: { before: SnapshotRecord; after: SnapshotRecord; changes: Record<string, [any, any]> }[] = [];

  const allKeys = new Set([...fromByGroup.keys(), ...toByGroup.keys()]);

  for (const key of allKeys) {
    const fromGroup = fromByGroup.get(key) ?? [];
    const toGroup = toByGroup.get(key) ?? [];

    if (fromGroup.length === 0) {
      added.push(...toGroup);
      continue;
    }
    if (toGroup.length === 0) {
      removed.push(...fromGroup);
      continue;
    }

    const fromUsed = new Set<number>();
    const toUsed = new Set<number>();

    for (let i = 0; i < toGroup.length; i++) {
      for (let j = 0; j < fromGroup.length; j++) {
        if (fromUsed.has(j) || toUsed.has(i)) continue;
        if (fromGroup[j].value === toGroup[i].value) {
          fromUsed.add(j);
          toUsed.add(i);
          const changes = getChanges(fromGroup[j], toGroup[i]);
          if (changes) {
            modified.push({ before: fromGroup[j], after: toGroup[i], changes });
          }
          break;
        }
      }
    }

    const remainingFrom = fromGroup.filter((_, i) => !fromUsed.has(i));
    const remainingTo = toGroup.filter((_, i) => !toUsed.has(i));

    for (let i = 0; i < Math.max(remainingFrom.length, remainingTo.length); i++) {
      if (i < remainingFrom.length && i < remainingTo.length) {
        const changes = getChanges(remainingFrom[i], remainingTo[i]);
        if (changes) {
          modified.push({ before: remainingFrom[i], after: remainingTo[i], changes });
        }
      } else if (i < remainingFrom.length) {
        removed.push(remainingFrom[i]);
      } else {
        added.push(remainingTo[i]);
      }
    }
  }

  return { added, removed, modified };
}
