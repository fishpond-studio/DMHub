import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { teamSettings, domains } from '../db/schema.js';
import { isPublicDomain, safeFetch } from '../lib/ssrf-guard.js';
import { buildUptimePushUrl, sendUptimePush } from '../lib/uptime-push.js';

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

  const urlObj = buildUptimePushUrl(pushUrl, 'up', 'OK');
  const safe = await isPublicDomain(urlObj.hostname);
  if (!safe) {
    throw new Error('不允许使用内网地址作为 Push URL');
  }

  try {
    await sendUptimePush(pushUrl, 'up', 'OK');
  } catch {
    // Persist a valid endpoint even when the remote monitor is temporarily down.
  }
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
  // SSRF 防护：禁止向内网或保留地址发起探测
  const safe = await isPublicDomain(domainName);
  if (!safe) {
    return {
      up: false,
      responseTime: 0,
      statusCode: 0,
    };
  }

  const url = `https://${domainName}`;
  const start = Date.now();
  try {
    const response = await safeFetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(10000),
    }, 0);
    const elapsed = Date.now() - start;
    const pushUrl = await getUptimePushUrl();
    if (pushUrl) {
      await sendUptimePush(pushUrl, response.ok ? 'up' : 'down', `${elapsed}ms`).catch(() => {});
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
      await sendUptimePush(pushUrl, 'down', 'Connection Failed').catch(() => {});
    }
    return {
      up: false,
      responseTime: elapsed,
      statusCode: 0,
    };
  }
}
