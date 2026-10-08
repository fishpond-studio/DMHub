import crypto from 'crypto';
import { cacheGetDel, cacheSet } from './cache.js';

export const SSE_TICKET_TTL_SECONDS = 30;

export async function issueSseTicket(userId: string): Promise<string> {
  const ticket = crypto.randomBytes(32).toString('base64url');
  await cacheSet(`sse-ticket:${ticket}`, userId, SSE_TICKET_TTL_SECONDS);
  return ticket;
}

export async function consumeSseTicket(ticket: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(ticket)) return null;
  return cacheGetDel(`sse-ticket:${ticket}`);
}
