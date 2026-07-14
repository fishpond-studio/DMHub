import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { apiKeys } from '../db/schema.js';

export async function generateApiKey(
  userId: string,
  name: string,
  permissions: string[],
): Promise<{ key: string; name: string; permissions: string[] }> {
  const db = getDb();

  const rawKey = `dmhub_${crypto.randomBytes(32).toString('hex')}`;
  const keyPrefix = rawKey.substring(0, 8);
  const keyHash = await bcrypt.hash(rawKey, 10);

  await db.insert(apiKeys).values({
    name,
    keyHash,
    keyPrefix,
    permissions,
    createdById: userId,
  });

  return { key: rawKey, name, permissions };
}

export async function listApiKeys(): Promise<
  Array<{
    id: string;
    name: string;
    keyPrefix: string;
    permissions: string[];
    lastUsedAt: Date | null;
    createdAt: Date;
  }>
> {
  const db = getDb();
  const rows = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      permissions: apiKeys.permissions,
      lastUsedAt: apiKeys.lastUsedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys);
  return rows;
}

export async function revokeApiKey(keyId: string): Promise<{ success: boolean }> {
  const db = getDb();
  const [existing] = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(eq(apiKeys.id, keyId))
    .limit(1);

  if (!existing) {
    throw new Error('API 密钥不存在');
  }

  await db.delete(apiKeys).where(eq(apiKeys.id, keyId));
  return { success: true };
}

export async function verifyApiKey(rawKey: string): Promise<{
  valid: boolean;
  keyId?: string;
  permissions?: string[];
}> {
  if (!rawKey.startsWith('dmhub_')) {
    return { valid: false };
  }

  const keyPrefix = rawKey.substring(0, 8);
  const db = getDb();

  const candidates = await db
    .select({
      id: apiKeys.id,
      keyHash: apiKeys.keyHash,
      permissions: apiKeys.permissions,
      expiresAt: apiKeys.expiresAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.keyPrefix, keyPrefix));

  for (const candidate of candidates) {
    if (candidate.expiresAt && new Date() > candidate.expiresAt) {
      continue;
    }
    const match = await bcrypt.compare(rawKey, candidate.keyHash);
    if (match) {
      await db
        .update(apiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(apiKeys.id, candidate.id));
      return {
        valid: true,
        keyId: candidate.id,
        permissions: candidate.permissions,
      };
    }
  }

  return { valid: false };
}

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const MAX_RATE_LIMIT_ENTRIES = 10000;

export function checkRateLimit(keyId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(keyId);

  if (!entry || now > entry.resetAt) {
    if (rateLimitMap.size >= MAX_RATE_LIMIT_ENTRIES && !entry) {
      for (const [k, v] of rateLimitMap) {
        if (now > v.resetAt) { rateLimitMap.delete(k); break; }
      }
    }
    rateLimitMap.set(keyId, { count: 1, resetAt: now + 60000 });
    return true;
  }

  if (entry.count >= 100) {
    return false;
  }

  entry.count++;
  return true;
}
