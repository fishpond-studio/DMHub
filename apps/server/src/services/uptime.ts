import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { teamSettings, domains } from '../db/schema.js';
import { isPublicDomain } from '../lib/ssrf-guard.js';

interface HealthCheckResult {
  up: boolean;
  responseTime: number;
  lastChecked: string;
  history?: Array<{ timestamp: string; up: boolean; responseTime: number }>;
}

const checkHistory = new Map<string, Array<{ timestamp: string; up: boolean; responseTime: number }>>();
const MAX_HISTORY_ENTRIES = 1000;

function cleanupHistory() {
  if (checkHistory.size > MAX_HISTORY_ENTRIES) {
    const now = Date.now();
    for (const [key, entries] of checkHistory) {
      if (entries.length === 0 || new Date(entries[entries.length - 1].timestamp).getTime() < now - 3600000) {
        checkHistory.delete(key);
      }
    }
  }
}

export async function getUptimePushUrl(): Promise<string | null> {
  const db = getDb();
  const [settings] = await db
    .select({ uptimePushUrl: teamSettings.uptimePushUrl })
    .from(teamSettings)
    .where(eq(teamSettings.id, 1));
  return settings?.uptimePushUrl ?? null;
}

export async function configureUptimePushUrl(pushUrl: string): Promise<{ configured: boolean }> {
  const db = getDb();

  try {
    const urlObj = new URL(pushUrl);
    const safe = await isPublicDomain(urlObj.hostname);
    if (!safe) {
      throw new Error('不允许使用内网地址作为 Push URL');
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('内网地址')) {
      throw err;
    }
    throw new Error('无效的 Push URL');
  }

  let testUrl = pushUrl.replace(/\/+$/, '');
  if (!testUrl.includes('/api/push/')) {
    testUrl = `${testUrl}/api/push/test`;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    await fetch(testUrl, { method: 'GET', signal: controller.signal });
    clearTimeout(timeout);
  } catch {}
  await db
    .update(teamSettings)
    .set({ uptimePushUrl: pushUrl, updatedAt: new Date() })
    .where(eq(teamSettings.id, 1));
  return { configured: true };
}

export async function removeUptimePushUrl(): Promise<{ success: boolean }> {
  const db = getDb();
  await db
    .update(teamSettings)
    .set({ uptimePushUrl: null, updatedAt: new Date() })
    .where(eq(teamSettings.id, 1));
  return { success: true };
}

export async function getUptimeStatus(domainId: string): Promise<HealthCheckResult> {
  const db = getDb();

  const [domain] = await db
    .select({ name: domains.name })
    .from(domains)
    .where(eq(domains.id, domainId))
    .limit(1);

  if (!domain) {
    throw new Error('域名不存在');
  }

  const result = await performHealthCheck(domain.name);
  const history = checkHistory.get(domainId) || [];
  history.unshift({ timestamp: new Date().toISOString(), up: result.up, responseTime: result.responseTime });
  if (history.length > 50) history.length = 50;
  checkHistory.set(domainId, history);
  cleanupHistory();

  return {
    up: result.up,
    responseTime: result.responseTime,
    lastChecked: new Date().toISOString(),
    history: history.slice(0, 20),
  };
}

export async function manualHealthCheck(domainId: string): Promise<{
  up: boolean;
  responseTime: number;
  statusCode: number;
}> {
  const db = getDb();
  const [domain] = await db
    .select({ name: domains.name })
    .from(domains)
    .where(eq(domains.id, domainId))
    .limit(1);

  if (!domain) {
    throw new Error('域名不存在');
  }

  const result = await performHealthCheck(domain.name);
  const history = checkHistory.get(domainId) || [];
  history.unshift({ timestamp: new Date().toISOString(), up: result.up, responseTime: result.responseTime });
  if (history.length > 50) history.length = 50;
  checkHistory.set(domainId, history);
  cleanupHistory();

  return {
    up: result.up,
    responseTime: result.responseTime,
    statusCode: result.statusCode,
  };
}

async function performHealthCheck(domainName: string): Promise<{
  up: boolean;
  responseTime: number;
  statusCode: number;
}> {
  const url = `https://${domainName}`;
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout);
    const elapsed = Date.now() - start;
    const pushUrl = await getUptimePushUrl();
    if (pushUrl) {
      const status = response.ok ? 'up' : 'down';
      const pushToken = extractPushToken(pushUrl);
      if (pushToken) {
        try {
          await fetch(`${pushUrl.replace(/\/+$/, '')}/api/push/${pushToken}?status=${status}&msg=${elapsed}ms`, {
            method: 'GET',
          }).catch(() => {});
        } catch {}
      }
    }
    return {
      up: response.ok,
      responseTime: elapsed,
      statusCode: response.status,
    };
  } catch {
    const elapsed = Date.now() - start;
    const pushUrl = await getUptimePushUrl();
    if (pushUrl) {
      const pushToken = extractPushToken(pushUrl);
      if (pushToken) {
        try {
          await fetch(`${pushUrl.replace(/\/+$/, '')}/api/push/${pushToken}?status=down&msg=Connection+Failed`, {
            method: 'GET',
          }).catch(() => {});
        } catch {}
      }
    }
    return {
      up: false,
      responseTime: elapsed,
      statusCode: 0,
    };
  }
}

function extractPushToken(pushUrl: string): string | null {
  const match = pushUrl.match(/\/api\/push\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

/** 供 monitor 服务复用的安全版本 */
export function extractPushTokenSafe(pushUrl: string): string | null {
  return extractPushToken(pushUrl);
}
