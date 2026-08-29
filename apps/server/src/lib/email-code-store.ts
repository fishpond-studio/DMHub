import crypto from 'crypto';
import { EMAIL_CODE_EXPIRY_MINUTES } from '@dmhub/shared';
import { cacheGet, cacheSet, cacheDel } from './cache.js';

interface EmailCodeEntry {
  code: string;
  expiresAt: number;
  lastSentAt: number;
  attempts: number;
}

const keyOf = (userId: string) => `emailcode:${userId}`;

const RATE_LIMIT_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

export function generateEmailCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export async function storeEmailCode(userId: string, code: string): Promise<{ success: boolean; error?: string }> {
  const now = Date.now();
  const raw = await cacheGet(keyOf(userId));
  const existing = raw ? (JSON.parse(raw) as EmailCodeEntry) : null;
  if (existing && now - existing.lastSentAt < RATE_LIMIT_MS) {
    const remaining = Math.ceil((RATE_LIMIT_MS - (now - existing.lastSentAt)) / 1000);
    return { success: false, error: `请 ${remaining} 秒后再试` };
  }
  const entry: EmailCodeEntry = {
    code,
    expiresAt: now + EMAIL_CODE_EXPIRY_MINUTES * 60 * 1000,
    lastSentAt: now,
    attempts: 0,
  };
  await cacheSet(keyOf(userId), JSON.stringify(entry), EMAIL_CODE_EXPIRY_MINUTES * 60 + 60);
  return { success: true };
}

export async function verifyEmailCodeEntry(userId: string, code: string): Promise<boolean> {
  const raw = await cacheGet(keyOf(userId));
  if (!raw) return false;
  const entry = JSON.parse(raw) as EmailCodeEntry;
  if (Date.now() > entry.expiresAt) {
    await cacheDel(keyOf(userId));
    return false;
  }
  entry.attempts++;
  if (entry.attempts > MAX_ATTEMPTS) {
    await cacheDel(keyOf(userId));
    return false;
  }
  if (entry.code !== code) {
    await cacheSet(keyOf(userId), JSON.stringify(entry), EMAIL_CODE_EXPIRY_MINUTES * 60 + 60);
    return false;
  }
  await cacheDel(keyOf(userId));
  return true;
}
