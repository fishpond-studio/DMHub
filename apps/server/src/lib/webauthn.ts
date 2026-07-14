import { getTeamSettings } from '../services/team.js';

interface ChallengeEntry {
  challenge: string;
  expiresAt: number;
}

const challengeStore = new Map<string, ChallengeEntry>();

export async function getWebAuthnConfig(hostname?: string) {
  const settings = await getTeamSettings();
  const siteUrl = settings?.siteUrl || `https://${hostname || 'localhost'}`;
  const rpID = siteUrl.replace(/^https?:\/\//, '').split(':')[0].split('/')[0];
  const rpName = settings?.name || 'DMHub';
  const origin = siteUrl;

  return { rpID, rpName, origin };
}

export function storeChallenge(userId: string, challenge: string) {
  challengeStore.set(userId, {
    challenge,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
}

export function getChallenge(userId: string): string | null {
  const entry = challengeStore.get(userId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    challengeStore.delete(userId);
    return null;
  }
  return entry.challenge;
}

export function deleteChallenge(userId: string) {
  challengeStore.delete(userId);
}
