import crypto from 'crypto';

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

const requests = new Map<string, AdminResetRequest>();

const REQUEST_EXPIRY_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export function createResetRequest(input: {
  userId: string;
  username: string;
  adminId: string;
  adminEmail: string;
  alternateEmail: string;
  emailCode: string;
}): string {
  const requestId = crypto.randomUUID();
  requests.set(requestId, {
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
  });
  return requestId;
}

export function getResetRequest(requestId: string): AdminResetRequest | undefined {
  const req = requests.get(requestId);
  if (!req) return undefined;
  if (Date.now() - req.createdAt > REQUEST_EXPIRY_MS) {
    requests.delete(requestId);
    return undefined;
  }
  return req;
}

export function verifyResetEmail(requestId: string, code: string): boolean {
  const req = requests.get(requestId);
  if (!req || req.status !== 'pending_email') return false;
  if (Date.now() - req.createdAt > REQUEST_EXPIRY_MS) {
    requests.delete(requestId);
    return false;
  }
  req.emailAttempts++;
  if (req.emailAttempts > MAX_ATTEMPTS) {
    requests.delete(requestId);
    return false;
  }
  if (req.emailCode !== code) return false;
  req.emailVerified = true;
  req.status = 'pending_admin';
  return true;
}

export function approveResetRequest(requestId: string): string | null {
  const req = requests.get(requestId);
  if (!req || req.status !== 'pending_admin') return null;
  const resetCode = crypto.randomBytes(16).toString('hex').toUpperCase();
  req.resetCode = resetCode;
  req.status = 'approved';
  return resetCode;
}

export function rejectResetRequest(requestId: string, reason?: string): boolean {
  const req = requests.get(requestId);
  if (!req || req.status !== 'pending_admin') return false;
  req.status = 'rejected';
  req.rejectReason = reason;
  return true;
}

export function getPendingRequests(): AdminResetRequest[] {
  const now = Date.now();
  const pending: AdminResetRequest[] = [];
  for (const [key, req] of requests) {
    if (now - req.createdAt > REQUEST_EXPIRY_MS) {
      requests.delete(key);
      continue;
    }
    if (req.status === 'pending_admin') {
      pending.push(req);
    }
  }
  return pending;
}

export function validateResetCode(userId: string, resetCode: string): AdminResetRequest | null {
  for (const [key, req] of requests) {
    if (Date.now() - req.createdAt > REQUEST_EXPIRY_MS) {
      requests.delete(key);
      continue;
    }
    if (req.userId === userId && req.status === 'approved') {
      req.resetAttempts++;
      if (req.resetAttempts > MAX_ATTEMPTS) {
        requests.delete(key);
        return null;
      }
      if (req.resetCode === resetCode) {
        requests.delete(key);
        return req;
      }
      return null;
    }
  }
  return null;
}

function cleanup() {
  const now = Date.now();
  for (const [key, req] of requests) {
    if (now - req.createdAt > REQUEST_EXPIRY_MS) {
      requests.delete(key);
    }
  }
}

setInterval(cleanup, 60 * 1000);
