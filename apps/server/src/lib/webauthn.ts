import { getTeamSettings } from '../services/team.js';
import { cacheGet, cacheSet, cacheDel } from './cache.js';

const CHALLENGE_TTL = 5 * 60;

export async function getWebAuthnConfig(hostname?: string) {
  const settings = await getTeamSettings();
  const siteUrl = settings?.siteUrl || `https://${hostname || 'localhost'}`;
  const rpID = siteUrl.replace(/^https?:\/\//, '').split(':')[0].split('/')[0];
  const rpName = settings?.name || 'DMHub';
  const origin = siteUrl;

  return { rpID, rpName, origin };
}

export async function storeChallenge(userId: string, challenge: string) {
  await cacheSet(`webauthn:${userId}`, challenge, CHALLENGE_TTL);
}

export async function getChallenge(userId: string): Promise<string | null> {
  return cacheGet(`webauthn:${userId}`);
}

export async function deleteChallenge(userId: string) {
  await cacheDel(`webauthn:${userId}`);
}
