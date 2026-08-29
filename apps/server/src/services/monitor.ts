import { and, eq, gte, desc, lt } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { domains, monitorChecks } from '../db/schema.js';
import { insertReturningOne } from '../db/helpers.js';
import { triggerNotification } from './notification.js';
import { getUptimePushUrl, extractPushTokenSafe } from './uptime.js';

export interface MonitorCheckRow {
  id: string;
  domainId: string;
  checkType: string;
  status: 'up' | 'down';
  statusCode: number | null;
  responseMs: number | null;
  error: string | null;
  checkedAt: string;
}

interface CheckOutcome {
  up: boolean;
  statusCode: number | null;
  responseMs: number;
  error: string | null;
}

async function performHttpCheck(domainName: string): Promise<CheckOutcome> {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`https://${domainName}`, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout);
    return {
      up: response.ok,
      statusCode: response.status,
      responseMs: Date.now() - start,
      error: null,
    };
  } catch (err: any) {
    clearTimeout(timeout);
    return {
      up: false,
      statusCode: null,
      responseMs: Date.now() - start,
      error: err?.name === 'AbortError' ? '请求超时' : (err?.message || '连接失败'),
    };
  }
}

export async function runMonitorCheck(domainId: string): Promise<MonitorCheckRow> {
  const db = getDb();
  const [domain] = await db
    .select({ id: domains.id, name: domains.name, prevStatus: domains.monitorStatus })
    .from(domains)
    .where(eq(domains.id, domainId))
    .limit(1);
  if (!domain) throw new Error('域名不存在');

  const outcome = await performHttpCheck(domain.name);
  const status: 'up' | 'down' = outcome.up ? 'up' : 'down';

  const inserted = await insertReturningOne<MonitorCheckRow>(
    monitorChecks,
    {
      domainId,
      checkType: 'http',
      status,
      statusCode: outcome.statusCode,
      responseMs: outcome.responseMs,
      error: outcome.error,
    },
    {
      id: monitorChecks.id,
      domainId: monitorChecks.domainId,
      checkType: monitorChecks.checkType,
      status: monitorChecks.status,
      statusCode: monitorChecks.statusCode,
      responseMs: monitorChecks.responseMs,
      error: monitorChecks.error,
      checkedAt: monitorChecks.checkedAt,
    },
  );

  await db
    .update(domains)
    .set({
      monitorStatus: status,
      monitorResponseMs: outcome.responseMs,
      monitorLastCheckedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(domains.id, domainId));

  await pushToUptime(domain.name, outcome);

  // 状态变更告警
  if (domain.prevStatus && domain.prevStatus !== status) {
    if (status === 'down') {
      await triggerNotification('monitor.down', {
        title: `域名不可用: ${domain.name}`,
        content: `域名 ${domain.name} HTTP 探测失败（${outcome.error || outcome.statusCode || '未知错误'}）。`,
        level: 'critical',
        metadata: { domainId: domain.id, domainName: domain.name, statusCode: outcome.statusCode },
      });
    } else {
      await triggerNotification('monitor.up', {
        title: `域名已恢复: ${domain.name}`,
        content: `域名 ${domain.name} 已恢复正常访问（${outcome.responseMs}ms）。`,
        level: 'info',
        metadata: { domainId: domain.id, domainName: domain.name },
      });
    }
  }

  return inserted;
}

let cycleRunning = false;

export async function runMonitorCycle(): Promise<void> {
  if (cycleRunning) {
    console.warn('[Monitor] previous cycle still running, skip');
    return;
  }
  cycleRunning = true;
  try {
    const db = getDb();
    const enabled = await db
      .select({ id: domains.id })
      .from(domains)
      .where(and(eq(domains.monitorEnabled, true), eq(domains.status, 'active')))
      .limit(200);

    for (const d of enabled) {
      try {
        await runMonitorCheck(d.id);
      } catch (err) {
        console.error('[Monitor] check failed for', d.id, err);
      }
    }
  } finally {
    cycleRunning = false;
  }
}

export async function getMonitorHistory(domainId: string, hours = 24): Promise<MonitorCheckRow[]> {
  const db = getDb();
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const rows = await db
    .select({
      id: monitorChecks.id,
      domainId: monitorChecks.domainId,
      checkType: monitorChecks.checkType,
      status: monitorChecks.status,
      statusCode: monitorChecks.statusCode,
      responseMs: monitorChecks.responseMs,
      error: monitorChecks.error,
      checkedAt: monitorChecks.checkedAt,
    })
    .from(monitorChecks)
    .where(and(eq(monitorChecks.domainId, domainId), gte(monitorChecks.checkedAt, since)))
    .orderBy(desc(monitorChecks.checkedAt))
    .limit(500);
  return rows as MonitorCheckRow[];
}

export interface MonitorSummary {
  monitored: number;
  up: number;
  down: number;
  unknown: number;
  domains: Array<{ id: string; name: string; status: string; monitorStatus: string | null; monitorResponseMs: number | null; monitorLastCheckedAt: string | null }>;
}

export async function getMonitorSummary(): Promise<MonitorSummary> {
  const db = getDb();
  const rows = await db
    .select({
      id: domains.id,
      name: domains.name,
      status: domains.status,
      monitorStatus: domains.monitorStatus,
      monitorResponseMs: domains.monitorResponseMs,
      monitorLastCheckedAt: domains.monitorLastCheckedAt,
    })
    .from(domains)
    .where(eq(domains.monitorEnabled, true));

  const summary = { monitored: rows.length, up: 0, down: 0, unknown: 0, domains: [] as MonitorSummary['domains'] };
  for (const r of rows) {
    const ms = r.monitorStatus ?? 'unknown';
    if (ms === 'up') summary.up++;
    else if (ms === 'down') summary.down++;
    else summary.unknown++;
    summary.domains.push({
      id: r.id,
      name: r.name,
      status: r.status,
      monitorStatus: r.monitorStatus,
      monitorResponseMs: r.monitorResponseMs,
      monitorLastCheckedAt: r.monitorLastCheckedAt ? new Date(r.monitorLastCheckedAt as any).toISOString() : null,
    });
  }
  return summary;
}

export async function setMonitorEnabled(domainId: string, enabled: boolean): Promise<void> {
  const db = getDb();
  await db
    .update(domains)
    .set({ monitorEnabled: enabled, updatedAt: new Date() })
    .where(eq(domains.id, domainId));
}

export async function cleanupMonitorHistory(days = 30): Promise<void> {
  const db = getDb();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  await db.delete(monitorChecks).where(lt(monitorChecks.checkedAt, cutoff));
}

async function pushToUptime(_domainName: string, outcome: CheckOutcome): Promise<void> {
  try {
    const pushUrl = await getUptimePushUrl();
    if (!pushUrl) return;
    const token = extractPushTokenSafe(pushUrl);
    if (!token) return;
    const status = outcome.up ? 'up' : 'down';
    const msg = outcome.up ? `${outcome.responseMs}ms` : (outcome.error || 'Failed');
    await fetch(`${pushUrl.replace(/\/+$/, '')}/api/push/${token}?status=${status}&msg=${encodeURIComponent(msg)}`, {
      method: 'GET',
    }).catch(() => {});
  } catch {}
}
