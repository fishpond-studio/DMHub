import crypto from 'crypto';
import { config } from '../../config/index.js';

const STATE_EXPIRY_MS = 10 * 60 * 1000;

export type OAuthIntent = 'login' | 'bind';

export interface OAuthState {
  providerId: string;
  /** 与 IdP 注册一致的绝对回调地址 */
  redirectUri: string;
  intent: OAuthIntent;
  /** bind 时绑定到该用户 */
  userId?: string;
  createdAt: number;
}

export function generateState(payload: Omit<OAuthState, 'createdAt'>): string {
  const state: OAuthState = {
    ...payload,
    createdAt: Date.now(),
  };
  const iv = crypto.randomBytes(12);
  const key = crypto.createHash('sha256').update(config.ENCRYPTION_KEY).digest();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(state), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64url');
}

export function verifyState(encodedState: string): OAuthState {
  let data: Buffer;
  try {
    data = Buffer.from(encodedState, 'base64url');
  } catch {
    throw new Error('Invalid OAuth state');
  }

  if (data.length < 28) {
    throw new Error('Invalid OAuth state');
  }

  const iv = data.subarray(0, 12);
  const authTag = data.subarray(12, 28);
  const encrypted = data.subarray(28);

  const key = crypto.createHash('sha256').update(config.ENCRYPTION_KEY).digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let decrypted: Buffer;
  try {
    decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  } catch {
    throw new Error('Invalid OAuth state');
  }

  const state = JSON.parse(decrypted.toString('utf8')) as OAuthState;

  if (!state.providerId || !state.redirectUri || !state.intent) {
    throw new Error('Invalid OAuth state payload');
  }

  if (Date.now() - state.createdAt > STATE_EXPIRY_MS) {
    throw new Error('OAuth state expired');
  }

  return state;
}
