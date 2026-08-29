import { eq, desc, and, ne } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { refreshTokens, users } from '../db/schema.js';
import { hashToken } from './auth.js';

export interface SessionInfo {
  id: string;
  userId: string;
  deviceInfo: string | null;
  expiresAt: string;
  createdAt: string;
  current: boolean;
}

export async function listUserSessions(userId: string, currentTokenHash?: string): Promise<SessionInfo[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: refreshTokens.id,
      userId: refreshTokens.userId,
      tokenHash: refreshTokens.tokenHash,
      deviceInfo: refreshTokens.deviceInfo,
      expiresAt: refreshTokens.expiresAt,
      createdAt: refreshTokens.createdAt,
    })
    .from(refreshTokens)
    .where(eq(refreshTokens.userId, userId))
    .orderBy(desc(refreshTokens.createdAt));

  return rows.map((r: any) => ({
    id: r.id,
    userId: r.userId,
    deviceInfo: r.deviceInfo,
    expiresAt: new Date(r.expiresAt as any).toISOString(),
    createdAt: new Date(r.createdAt as any).toISOString(),
    current: currentTokenHash ? r.tokenHash === currentTokenHash : false,
  }));
}

export async function revokeSession(userId: string, sessionId: string): Promise<boolean> {
  const db = getDb();
  const [target] = await db
    .select({ id: refreshTokens.id })
    .from(refreshTokens)
    .where(and(eq(refreshTokens.id, sessionId), eq(refreshTokens.userId, userId)))
    .limit(1);
  if (!target) return false;
  await db.delete(refreshTokens).where(eq(refreshTokens.id, sessionId));
  return true;
}

export async function revokeOtherSessions(userId: string, currentTokenHash: string): Promise<void> {
  const db = getDb();
  await db
    .delete(refreshTokens)
    .where(and(eq(refreshTokens.userId, userId), ne(refreshTokens.tokenHash, currentTokenHash)));
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  const db = getDb();
  await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
}

export interface AdminSessionInfo extends SessionInfo {
  username: string;
  displayName: string | null;
  role: string;
}

export async function listAllSessions(): Promise<AdminSessionInfo[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: refreshTokens.id,
      userId: refreshTokens.userId,
      tokenHash: refreshTokens.tokenHash,
      deviceInfo: refreshTokens.deviceInfo,
      expiresAt: refreshTokens.expiresAt,
      createdAt: refreshTokens.createdAt,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
    })
    .from(refreshTokens)
    .innerJoin(users, eq(refreshTokens.userId, users.id))
    .orderBy(desc(refreshTokens.createdAt))
    .limit(500);

  return rows.map((r: any) => ({
    id: r.id,
    userId: r.userId,
    username: r.username,
    displayName: r.displayName,
    role: r.role,
    deviceInfo: r.deviceInfo,
    expiresAt: new Date(r.expiresAt as any).toISOString(),
    createdAt: new Date(r.createdAt as any).toISOString(),
    current: false,
  }));
}

export function hashRefreshToken(token: string): string {
  return hashToken(token);
}
