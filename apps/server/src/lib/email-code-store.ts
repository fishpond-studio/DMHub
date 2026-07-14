import crypto from 'crypto';
import { EMAIL_CODE_EXPIRY_MINUTES } from '@dmhub/shared';

interface EmailCodeEntry {
  code: string;
  expiresAt: number;
  lastSentAt: number;
  attempts: number;
}

const store = new Map<string, EmailCodeEntry>();

const RATE_LIMIT_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

export function generateEmailCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function storeEmailCode(userId: string, code: string): { success: boolean; error?: string } {
  const now = Date.now();
  const existing = store.get(userId);
  if (existing && now - existing.lastSentAt < RATE_LIMIT_MS) {
    const remaining = Math.ceil((RATE_LIMIT_MS - (now - existing.lastSentAt)) / 1000);
    return { success: false, error: `请 ${remaining} 秒后再试` };
  }
  store.set(userId, {
    code,
    expiresAt: now + EMAIL_CODE_EXPIRY_MINUTES * 60 * 1000,
    lastSentAt: now,
    attempts: 0,
  });
  return { success: true };
}

export function verifyEmailCodeEntry(userId: string, code: string): boolean {
  const entry = store.get(userId);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    store.delete(userId);
    return false;
  }
  entry.attempts++;
  if (entry.attempts > MAX_ATTEMPTS) {
    store.delete(userId);
    return false;
  }
  if (entry.code !== code) return false;
  store.delete(userId);
  return true;
}

function cleanup() {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.expiresAt) {
      store.delete(key);
    }
  }
}

setInterval(cleanup, 60 * 1000);
