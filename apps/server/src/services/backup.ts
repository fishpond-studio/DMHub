import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { domains, dnsRecords } from '../db/schema.js';
import { insertReturningOne } from '../db/helpers.js';
import { logOperation } from '../lib/log.js';

const APP_NAME = 'dmhub';
const BACKUP_VERSION = 1;

export interface BackupPayload {
  app: string;
  version: number;
  exportedAt: string;
  domains: Array<{
    name: string;
    status: string;
    groupName: string | null;
    tags: string[] | null;
    notes: string | null;
    expiresAt: string | null;
    autoCheckExpiry: boolean;
    expiryRemindDays: number[] | null;
    records: Array<{
      recordType: string;
      name: string;
      value: string;
      ttl: number;
      priority: number | null;
      proxied: boolean;
      notes: string | null;
    }>;
  }>;
}

export async function exportBackup(userId: string): Promise<BackupPayload> {
  const db = getDb();
  const allDomains = await db
    .select({
      id: domains.id,
      name: domains.name,
      status: domains.status,
      groupName: domains.groupName,
      tags: domains.tags,
      notes: domains.notes,
      expiresAt: domains.expiresAt,
      autoCheckExpiry: domains.autoCheckExpiry,
      expiryRemindDays: domains.expiryRemindDays,
    })
    .from(domains);

  const result: BackupPayload = {
    app: APP_NAME,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    domains: [],
  };

  for (const d of allDomains as any[]) {
    const records = await db
      .select({
        recordType: dnsRecords.recordType,
        name: dnsRecords.name,
        value: dnsRecords.value,
        ttl: dnsRecords.ttl,
        priority: dnsRecords.priority,
        proxied: dnsRecords.proxied,
        notes: dnsRecords.notes,
      })
      .from(dnsRecords)
      .where(eq(dnsRecords.domainId, d.id));

    result.domains.push({
      name: d.name,
      status: d.status,
      groupName: d.groupName ?? null,
      tags: d.tags ?? null,
      notes: d.notes ?? null,
      expiresAt: d.expiresAt ? new Date(d.expiresAt).toISOString() : null,
      autoCheckExpiry: d.autoCheckExpiry ?? true,
      expiryRemindDays: d.expiryRemindDays ?? null,
      records: (records as any[]).map((r) => ({
        recordType: r.recordType,
        name: r.name,
        value: r.value,
        ttl: r.ttl,
        priority: r.priority ?? null,
        proxied: r.proxied ?? false,
        notes: r.notes ?? null,
      })),
    });
  }

  await logOperation({
    userId,
    action: 'backup.export',
    targetType: 'backup',
    targetId: 'export',
    detail: { domainCount: result.domains.length },
  });

  return result;
}

export async function importBackup(
  userId: string,
  payload: BackupPayload,
  ipAddress?: string,
  userAgent?: string,
): Promise<{ domainsImported: number; domainsSkipped: number; recordsImported: number; recordsSkipped: number }> {
  const db = getDb();
  let domainsImported = 0;
  let domainsSkipped = 0;
  let recordsImported = 0;
  let recordsSkipped = 0;

  for (const d of payload.domains || []) {
    const [existing] = await db.select({ id: domains.id }).from(domains).where(eq(domains.name, d.name)).limit(1);
    let domainId = existing?.id;

    if (existing) {
      domainsSkipped++;
    } else {
      const inserted = await insertReturningOne<{ id: string }>(
        domains,
        {
          name: d.name,
          status: d.status || 'active',
          groupName: d.groupName || null,
          tags: d.tags || [],
          notes: d.notes || null,
          expiresAt: d.expiresAt ? new Date(d.expiresAt) : null,
          autoCheckExpiry: d.autoCheckExpiry ?? true,
          expiryRemindDays: d.expiryRemindDays || [30, 14, 7, 3, 1, 0],
        },
        { id: domains.id },
      );
      domainId = (inserted as any)?.id;
      domainsImported++;
    }

    if (!domainId) continue;

    const existingRecords = await db
      .select({ recordType: dnsRecords.recordType, name: dnsRecords.name })
      .from(dnsRecords)
      .where(eq(dnsRecords.domainId, domainId));
    const existingSet = new Set(
      (existingRecords as any[]).map((r) => `${r.recordType}:${r.name}`),
    );

    for (const r of d.records || []) {
      const key = `${r.recordType}:${r.name}`;
      if (existingSet.has(key)) {
        recordsSkipped++;
        continue;
      }
      await db.insert(dnsRecords).values({
        domainId,
        recordType: r.recordType,
        name: r.name,
        value: r.value,
        ttl: r.ttl || 3600,
        priority: r.priority ?? null,
        proxied: r.proxied ?? false,
        notes: r.notes || null,
      });
      existingSet.add(key);
      recordsImported++;
    }
  }

  await logOperation({
    userId,
    action: 'backup.restore',
    targetType: 'backup',
    targetId: 'import',
    detail: { domainsImported, domainsSkipped, recordsImported, recordsSkipped },
    ipAddress,
    userAgent,
  });

  return { domainsImported, domainsSkipped, recordsImported, recordsSkipped };
}
