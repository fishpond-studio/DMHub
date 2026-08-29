import crypto from 'crypto';
import { cacheGet, cacheSet, cacheDel } from '../cache.js';

export interface LoginTicketPayload {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    username: string | null;
    email: string | null;
    role: string;
  };
  createdAt: number;
}

const TICKET_TTL_SECONDS = 60;

/** 创建一次性登录票据，避免 access_token 出现在 URL 查询参数中 */
export async function createLoginTicket(payload: Omit<LoginTicketPayload, 'createdAt'>): Promise<string> {
  const id = crypto.randomBytes(24).toString('base64url');
  const body: LoginTicketPayload = { ...payload, createdAt: Date.now() };
  await cacheSet(`ticket:${id}`, JSON.stringify(body), TICKET_TTL_SECONDS);
  return id;
}

export async function consumeLoginTicket(ticket: string): Promise<LoginTicketPayload | null> {
  const raw = await cacheGet(`ticket:${ticket}`);
  if (!raw) return null;
  await cacheDel(`ticket:${ticket}`);
  const payload = JSON.parse(raw) as LoginTicketPayload;
  if (Date.now() - payload.createdAt > TICKET_TTL_SECONDS * 1000) return null;
  return payload;
}
