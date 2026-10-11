import crypto from 'crypto';
import { EMAIL_CODE_EXPIRY_MINUTES } from '@dmhub/shared';
import { cacheGet, cacheSet, cacheDel } from './cache.js';
import { safeCompare } from './crypto.js';

interface EmailCodeEntry {
  code: string;
  expiresAt: number;
  lastSentAt: number;
  attempts: number;
  // purpose 为 "email-change" 时，记录待换绑的新邮箱
  pendingEmail?: string;
}

export type EmailCodePurpose = '2fa' | 'email-change' | 'email-verify';

const keyOf = (userId: string, purpose: EmailCodePurpose) => `emailcode:${purpose}:${userId}`;

const RATE_LIMIT_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

export function generateEmailCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export async function storeEmailCode(
  userId: string,
  code: string,
  purpose: EmailCodePurpose = '2fa',
  pendingEmail?: string,
): Promise<{ success: boolean; error?: string }> {
  const now = Date.now();
  const raw = await cacheGet(keyOf(userId, purpose));
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
    ...(pendingEmail ? { pendingEmail } : {}),
  };
  await cacheSet(keyOf(userId, purpose), JSON.stringify(entry), EMAIL_CODE_EXPIRY_MINUTES * 60 + 60);
  return { success: true };
}

export async function verifyEmailCodeEntry(userId: string, code: string, purpose: EmailCodePurpose = '2fa'): Promise<boolean> {
  const raw = await cacheGet(keyOf(userId, purpose));
  if (!raw) return false;
  const entry = JSON.parse(raw) as EmailCodeEntry;
  if (Date.now() > entry.expiresAt) {
    await cacheDel(keyOf(userId, purpose));
    return false;
  }
  entry.attempts++;
  if (entry.attempts > MAX_ATTEMPTS) {
    await cacheDel(keyOf(userId, purpose));
    return false;
  }
  if (!safeCompare(entry.code, code)) {
    await cacheSet(keyOf(userId, purpose), JSON.stringify(entry), EMAIL_CODE_EXPIRY_MINUTES * 60 + 60);
    return false;
  }
  await cacheDel(keyOf(userId, purpose));
  return true;
}

/** 读取待换绑的新邮箱（不影响验证码有效性），仅用于 "email-change" 用途 */
export async function getEmailCodePendingEmail(userId: string, purpose: EmailCodePurpose = 'email-change'): Promise<string | null> {
  const raw = await cacheGet(keyOf(userId, purpose));
  if (!raw) return null;
  const entry = JSON.parse(raw) as EmailCodeEntry;
  if (Date.now() > entry.expiresAt || !entry.pendingEmail) return null;
  return entry.pendingEmail;
}