import crypto from 'crypto';
import { cacheGet, cacheSet, cacheDel, cacheKeys } from './cache.js';

interface AdminResetRequest {
  requestId: string;
  userId: string;
  username: string;
  adminId: string;
  adminEmail: string;
  alternateEmail: string;
  emailCode: string;
  emailVerified: boolean;
  resetCode?: string;
  status: 'pending_email' | 'pending_admin' | 'approved' | 'rejected';
  rejectReason?: string;
  createdAt: number;
  emailAttempts: number;
  resetAttempts: number;
}

const KEY_PREFIX = 'adminreset:';
const REQUEST_TTL_SECONDS = 30 * 60;
const REQUEST_EXPIRY_MS = REQUEST_TTL_SECONDS * 1000;
const MAX_ATTEMPTS = 5;

const keyOf = (requestId: string) => `${KEY_PREFIX}${requestId}`;

async function getRequest(requestId: string): Promise<AdminResetRequest | undefined> {
  const raw = await cacheGet(keyOf(requestId));
  if (!raw) return undefined;
  const req = JSON.parse(raw) as AdminResetRequest;
  if (Date.now() - req.createdAt > REQUEST_EXPIRY_MS) {
    await cacheDel(keyOf(requestId));
    return undefined;
  }
  return req;
}

async function saveRequest(req: AdminResetRequest): Promise<void> {
  await cacheSet(keyOf(req.requestId), JSON.stringify(req), REQUEST_TTL_SECONDS);
}

export async function createResetRequest(input: {
  userId: string;
  username: string;
  adminId: string;
  adminEmail: string;
  alternateEmail: string;
  emailCode: string;
}): Promise<string> {
  const requestId = crypto.randomUUID();
  const req: AdminResetRequest = {
    requestId,
    userId: input.userId,
    username: input.username,
    adminId: input.adminId,
    adminEmail: input.adminEmail,
    alternateEmail: input.alternateEmail,
    emailCode: input.emailCode,
    emailVerified: false,
    status: 'pending_email',
    createdAt: Date.now(),
    emailAttempts: 0,
    resetAttempts: 0,
  };
  await saveRequest(req);
  return requestId;
}

export async function getResetRequest(requestId: string): Promise<AdminResetRequest | undefined> {
  return getRequest(requestId);
}

export async function verifyResetEmail(requestId: string, code: string): Promise<boolean> {
  const req = await getRequest(requestId);
  if (!req || req.status !== 'pending_email') return false;
  if (Date.now() - req.createdAt > REQUEST_EXPIRY_MS) {
    await cacheDel(keyOf(requestId));
    return false;
  }
  req.emailAttempts++;
  if (req.emailAttempts > MAX_ATTEMPTS) {
    await cacheDel(keyOf(requestId));
    return false;
  }
  if (req.emailCode !== code) {
    await saveRequest(req);
    return false;
  }
  req.emailVerified = true;
  req.status = 'pending_admin';
  await saveRequest(req);
  return true;
}

export async function approveResetRequest(requestId: string): Promise<string | null> {
  const req = await getRequest(requestId);
  if (!req || req.status !== 'pending_admin') return null;
  const resetCode = crypto.randomBytes(16).toString('hex').toUpperCase();
  req.resetCode = resetCode;
  req.status = 'approved';
  await saveRequest(req);
  return resetCode;
}

export async function rejectResetRequest(requestId: string, reason?: string): Promise<boolean> {
  const req = await getRequest(requestId);
  if (!req || req.status !== 'pending_admin') return false;
  req.status = 'rejected';
  req.rejectReason = reason;
  await saveRequest(req);
  return true;
}

export async function getPendingRequests(): Promise<AdminResetRequest[]> {
  const keys = await cacheKeys(KEY_PREFIX);
  const pending: AdminResetRequest[] = [];
  for (const key of keys) {
    const raw = await cacheGet(key);
    if (!raw) continue;
    const req = JSON.parse(raw) as AdminResetRequest;
    if (Date.now() - req.createdAt > REQUEST_EXPIRY_MS) {
      await cacheDel(key);
      continue;
    }
    if (req.status === 'pending_admin') pending.push(req);
  }
  return pending;
}

export async function validateResetCode(userId: string, resetCode: string): Promise<AdminResetRequest | null> {
  const keys = await cacheKeys(KEY_PREFIX);
  for (const key of keys) {
    const raw = await cacheGet(key);
    if (!raw) continue;
    const req = JSON.parse(raw) as AdminResetRequest;
    if (Date.now() - req.createdAt > REQUEST_EXPIRY_MS) {
      await cacheDel(key);
      continue;
    }
    if (req.userId === userId && req.status === 'approved') {
      req.resetAttempts++;
      if (req.resetAttempts > MAX_ATTEMPTS) {
        await cacheDel(key);
        return null;
      }
      await saveRequest(req);
      if (req.resetCode === resetCode) {
        await cacheDel(key);
        return req;
      }
      return null;
    }
  }
  return null;
}
