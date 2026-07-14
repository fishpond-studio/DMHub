import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { providerConfigs, domains, dnsRecords, operationLogs } from '../db/schema.js';
import { getAdapter } from '@dmhub/dns-providers';
import type { Credentials } from '@dmhub/dns-providers';
import { encryptCredentials, decryptCredentials, maskCredentials } from '../lib/credential-encryption.js';
import { notifyAdmins } from './notification.js';
import { insertReturningOne } from '../db/helpers.js';

export async function createProviderConfig(
  userId: string,
  input: { name: string; providerId: string; credentials: Record<string, string> },
  ipAddress?: string,
  userAgent?: string,
) {
  const db = getDb();

  const adapter = getAdapter(input.providerId);
  if (!adapter) {
    throw new Error('不支持的 DNS 服务商: ' + input.providerId);
  }

  const encryptedCreds = encryptCredentials(input.providerId, input.credentials);

  const config = await insertReturningOne(
    providerConfigs,
    {
      providerId: input.providerId,
      name: input.name,
      credentials: encryptedCreds,
    },
    {
      id: providerConfigs.id,
      providerId: providerConfigs.providerId,
      name: providerConfigs.name,
      credentials: providerConfigs.credentials,
      enabled: providerConfigs.enabled,
      createdAt: providerConfigs.createdAt,
      updatedAt: providerConfigs.updatedAt,
    },
  );

  await db.insert(operationLogs).values({
    userId,
    action: 'provider.config',
    targetType: 'provider_config',
    targetId: config.id,
    detail: { name: input.name, providerId: input.providerId },
    ipAddress: ipAddress ?? null,
    userAgent: userAgent ?? null,
  });

  await notifyAdmins('provider.created', {
    title: 'DNS 服务商配置已添加',
    content: `新增了 ${input.providerId} 服务商配置 "${input.name}"。`,
    level: 'info' as const,
    metadata: { providerId: input.providerId, name: input.name },
  });

  return {
    ...config,
    credentials: maskCredentials(input.providerId, input.credentials),
  };
}

export async function listProviderConfigs() {
  const db = getDb();
  const configs = await db
    .select({
      id: providerConfigs.id,
      providerId: providerConfigs.providerId,
      name: providerConfigs.name,
      credentials: providerConfigs.credentials,
      enabled: providerConfigs.enabled,
      createdAt: providerConfigs.createdAt,
      updatedAt: providerConfigs.updatedAt,
    })
    .from(providerConfigs);

  return configs.map((c: { providerId: string; credentials: Record<string, string>; [key: string]: unknown }) => ({
    ...c,
    credentials: maskCredentials(c.providerId, c.credentials as Record<string, string>),
  }));
}

export async function getProviderConfig(id: string) {
  const db = getDb();
  const [config] = await db
    .select({
      id: providerConfigs.id,
      providerId: providerConfigs.providerId,
      name: providerConfigs.name,
      credentials: providerConfigs.credentials,
      enabled: providerConfigs.enabled,
      createdAt: providerConfigs.createdAt,
      updatedAt: providerConfigs.updatedAt,
    })
    .from(providerConfigs)
    .where(eq(providerConfigs.id, id))
    .limit(1);

  if (!config) return null;

  return {
    ...config,
    credentials: maskCredentials(config.providerId, config.credentials as Record<string, string>),
  };
}

export async function updateProviderConfig(
  userId: string,
  id: string,
  input: { name?: string; credentials?: Record<string, string>; enabled?: boolean },
  ipAddress?: string,
  userAgent?: string,
) {
  const db = getDb();

  const [existing] = await db
    .select({
      id: providerConfigs.id,
      providerId: providerConfigs.providerId,
      credentials: providerConfigs.credentials,
    })
    .from(providerConfigs)
    .where(eq(providerConfigs.id, id))
    .limit(1);

  if (!existing) {
    throw new Error('服务商配置不存在');
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) updateData.name = input.name;
  if (input.enabled !== undefined) updateData.enabled = input.enabled;
  if (input.credentials !== undefined) {
    updateData.credentials = encryptCredentials(existing.providerId, input.credentials);
  }

  await db
    .update(providerConfigs)
    .set(updateData)
    .where(eq(providerConfigs.id, id));

  await db.insert(operationLogs).values({
    userId,
    action: 'provider.config',
    targetType: 'provider_config',
    targetId: id,
    detail: { updatedFields: Object.keys(updateData).filter((k) => k !== 'updatedAt') },
    ipAddress: ipAddress ?? null,
    userAgent: userAgent ?? null,
  });

  if (input.credentials !== undefined) {
    await notifyAdmins('provider.updated', {
      title: 'DNS 服务商凭证已变更',
      content: `服务商配置 "${input.name ?? existing.providerId}" 的凭证已被更新，相关域名解析管理可能受影响。`,
      level: 'warning' as const,
      metadata: { providerId: existing.providerId, configId: id },
    });
  }

  const [updated] = await db
    .select({
      id: providerConfigs.id,
      providerId: providerConfigs.providerId,
      name: providerConfigs.name,
      credentials: providerConfigs.credentials,
      enabled: providerConfigs.enabled,
      createdAt: providerConfigs.createdAt,
      updatedAt: providerConfigs.updatedAt,
    })
    .from(providerConfigs)
    .where(eq(providerConfigs.id, id))
    .limit(1);

  const displayCreds = input.credentials
    ? maskCredentials(existing.providerId, input.credentials)
    : maskCredentials(existing.providerId, updated!.credentials as Record<string, string>);

  return { ...updated!, credentials: displayCreds };
}

export async function deleteProviderConfig(
  userId: string,
  id: string,
  confirmed: boolean,
  ipAddress?: string,
  userAgent?: string,
) {
  const db = getDb();

  const [existing] = await db
    .select({
      id: providerConfigs.id,
      name: providerConfigs.name,
    })
    .from(providerConfigs)
    .where(eq(providerConfigs.id, id))
    .limit(1);

  if (!existing) {
    throw new Error('服务商配置不存在');
  }

  const associatedDomains = await db
    .select({ id: domains.id })
    .from(domains)
    .where(eq(domains.providerConfigId, id));

  if (associatedDomains.length > 0 && !confirmed) {
    return {
      requiresConfirmation: true,
      warning: `该服务商配置下有 ${associatedDomains.length} 个关联域名，删除后相关域名将失去关联。确定要删除吗？`,
      domainCount: associatedDomains.length,
    };
  }

  if (associatedDomains.length > 0) {
    for (const domain of associatedDomains) {
      await db.update(domains).set({ providerConfigId: null, updatedAt: new Date() }).where(eq(domains.id, domain.id));
    }
  }

  await db.delete(providerConfigs).where(eq(providerConfigs.id, id));

  await db.insert(operationLogs).values({
    userId,
    action: 'provider.config',
    targetType: 'provider_config',
    targetId: id,
    detail: { name: existing.name, deletedDomains: associatedDomains.length },
    ipAddress: ipAddress ?? null,
    userAgent: userAgent ?? null,
  });

  await notifyAdmins('provider.deleted', {
    title: 'DNS 服务商配置已删除',
    content: `服务商配置 "${existing.name}" 已被删除，连带删除 ${associatedDomains.length} 个关联域名。`,
    level: 'warning' as const,
    metadata: { configId: id, deletedDomains: associatedDomains.length },
  });

  return { success: true };
}

export async function testProviderConnection(id: string) {
  const db = getDb();

  const [config] = await db
    .select({
      providerId: providerConfigs.providerId,
      credentials: providerConfigs.credentials,
    })
    .from(providerConfigs)
    .where(eq(providerConfigs.id, id))
    .limit(1);

  if (!config) {
    throw new Error('服务商配置不存在');
  }

  const adapter = getAdapter(config.providerId);
  if (!adapter) {
    throw new Error('不支持的 DNS 服务商');
  }

  const decryptedCreds = decryptCredentials(config.providerId, config.credentials as Record<string, string>);

  try {
    const success = await adapter.testConnection(decryptedCreds as Credentials);
    return { success };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '连接测试失败';
    return { success: false, error: message };
  }
}

export async function syncProviderDomains(
  userId: string,
  id: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const db = getDb();

  const [config] = await db
    .select({
      id: providerConfigs.id,
      providerId: providerConfigs.providerId,
      credentials: providerConfigs.credentials,
    })
    .from(providerConfigs)
    .where(eq(providerConfigs.id, id))
    .limit(1);

  if (!config) {
    throw new Error('服务商配置不存在');
  }

  const adapter = getAdapter(config.providerId);
  if (!adapter) {
    throw new Error('不支持的 DNS 服务商');
  }

  const decryptedCreds = decryptCredentials(config.providerId, config.credentials as Record<string, string>) as Credentials;

  const providerDomains = await adapter.listDomains(decryptedCreds);

  let syncedDomains = 0;
  let syncedRecords = 0;

  for (const pd of providerDomains) {
    const [existing] = await db
      .select({ id: domains.id })
      .from(domains)
      .where(eq(domains.providerDomainId, pd.id))
      .limit(1);

    let domainId: string;

    if (existing) {
      domainId = existing.id;
      await db
        .update(domains)
        .set({
          name: pd.name,
          status: pd.status,
          providerId: config.providerId,
          providerConfigId: config.id,
          updatedAt: new Date(),
        })
        .where(eq(domains.id, existing.id));
    } else {
      const inserted = await insertReturningOne<{ id: string }>(
        domains,
        {
          name: pd.name,
          providerId: config.providerId,
          providerDomainId: pd.id,
          providerConfigId: config.id,
          status: pd.status === 'active' ? 'active' : 'expired',
        },
        { id: domains.id },
      );
      domainId = inserted.id;
    }

    syncedDomains++;

    try {
      const providerRecords = await adapter.listRecords(decryptedCreds, pd.id);

      for (const pr of providerRecords) {
        const [existingRecord] = await db
          .select({ id: dnsRecords.id })
          .from(dnsRecords)
          .where(eq(dnsRecords.providerRecordId, pr.id))
          .limit(1);

        if (existingRecord) {
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
            .where(eq(dnsRecords.id, existingRecord.id));
        } else {
          await db.insert(dnsRecords).values({
            domainId,
            recordType: pr.type,
            name: pr.name,
            value: pr.value,
            ttl: pr.ttl,
            priority: pr.priority ?? null,
            proxied: pr.proxied ?? false,
            providerRecordId: pr.id,
          });
        }
        syncedRecords++;
      }
    } catch (err) {
      console.error('Failed to sync records for domain:', domainId, err);
    }
  }

  await db.insert(operationLogs).values({
    userId,
    action: 'provider.config',
    targetType: 'provider_config',
    targetId: id,
    detail: { syncedDomains, syncedRecords },
    ipAddress: ipAddress ?? null,
    userAgent: userAgent ?? null,
  });

  return { syncedDomains, syncedRecords };
}
