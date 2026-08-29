import cron from 'node-cron';
import { eq, and, isNotNull, lte, lt } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { domains, operationLogs, teamSettings } from '../db/schema.js';
import { EXPIRY_CHECK_CRON, DEFAULT_EXPIRY_REMIND_DAYS } from '@dmhub/shared';
import { triggerNotification } from '../services/notification.js';
import { checkDomainSsl } from '../services/domain.js';
import { runMonitorCycle, cleanupMonitorHistory } from '../services/monitor.js';

let cronJob: cron.ScheduledTask | null = null;
let monitorJob: cron.ScheduledTask | null = null;
let retentionJob: cron.ScheduledTask | null = null;

const MONITOR_CRON = '*/15 * * * *';
const RETENTION_CRON = '0 3 * * *';
const MONITOR_HISTORY_DAYS = 30;

export function startExpiryCheckCron() {
  if (cronJob) return;

  cronJob = cron.schedule(EXPIRY_CHECK_CRON, async () => {
    console.log('[Cron] Running expiry check...');
    await checkDomainExpiry();
    await checkSslExpiryReminders();
  });

  console.log(`[Cron] Expiry check scheduled: ${EXPIRY_CHECK_CRON}`);
}

export function startBackgroundJobs() {
  if (!monitorJob) {
    monitorJob = cron.schedule(MONITOR_CRON, async () => {
      try {
        await runMonitorCycle();
      } catch (err) {
        console.error('[Cron] Monitor cycle failed:', err);
      }
    });
    console.log(`[Cron] Monitor check scheduled: ${MONITOR_CRON}`);
  }

  if (!retentionJob) {
    retentionJob = cron.schedule(RETENTION_CRON, async () => {
      try {
        await cleanupMonitorHistory(MONITOR_HISTORY_DAYS);
        await cleanupOldLogs();
      } catch (err) {
        console.error('[Cron] Retention cleanup failed:', err);
      }
    });
    console.log(`[Cron] Retention cleanup scheduled: ${RETENTION_CRON}`);
  }
}

async function cleanupOldLogs() {
  const db = getDb();
  const [settings] = await db
    .select({ logRetentionDays: teamSettings.logRetentionDays })
    .from(teamSettings)
    .where(eq(teamSettings.id, 1));
  const days = settings?.logRetentionDays;
  if (!days || days <= 0) return;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  await db.delete(operationLogs).where(lt(operationLogs.createdAt, cutoff));
}

export function stopExpiryCheckCron() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
  }
  if (monitorJob) {
    monitorJob.stop();
    monitorJob = null;
  }
  if (retentionJob) {
    retentionJob.stop();
    retentionJob = null;
  }
}

/** 证书到期提醒：基于已缓存的 ssl_expires_at；顺带抽样刷新若干域名证书 */
async function checkSslExpiryReminders() {
  try {
    const db = getDb();
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const withSsl = await db
      .select({
        id: domains.id,
        name: domains.name,
        sslExpiresAt: domains.sslExpiresAt,
      })
      .from(domains)
      .where(
        and(
          isNotNull(domains.sslExpiresAt),
          lte(domains.sslExpiresAt, in30),
        ),
      )
      .limit(100);

    for (const domain of withSsl) {
      if (!domain.sslExpiresAt) continue;
      const expiresAt = new Date(domain.sslExpiresAt);
      expiresAt.setHours(0, 0, 0, 0);
      const days = Math.round((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (![30, 14, 7, 3, 1, 0].includes(days) && days > 0) continue;

      const expired = days <= 0;
      await triggerNotification(expired ? 'ssl.expired' : 'ssl.expiring', {
        title: expired
          ? `证书已过期: ${domain.name}`
          : `证书即将过期: ${domain.name}`,
        content: expired
          ? `域名 ${domain.name} 的 HTTPS 证书已过期，请尽快续期。`
          : `域名 ${domain.name} 的 HTTPS 证书将在 ${days} 天后过期（${expiresAt.toLocaleDateString('zh-CN')}）。`,
        level: expired ? 'critical' : 'warning',
        metadata: {
          domainId: domain.id,
          domainName: domain.name,
          daysRemaining: days,
          expiresAt: domain.sslExpiresAt,
        },
      });
    }

    // 每天抽样刷新最多 10 个活跃域名的证书
    const toRefresh = await db
      .select({ id: domains.id, name: domains.name })
      .from(domains)
      .where(eq(domains.status, 'active'))
      .limit(50);

    let refreshed = 0;
    for (const d of toRefresh) {
      if (refreshed >= 10) break;
      try {
        await checkDomainSsl(d.id);
        refreshed++;
      } catch {
        // ignore single failure
      }
    }
    if (refreshed > 0) {
      console.log(`[Cron] SSL cert refreshed for ${refreshed} domains`);
    }
  } catch (err) {
    console.error('[Cron] SSL expiry check failed:', err);
  }
}

async function checkDomainExpiry() {
  const db = getDb();

  const domainList = await db
    .select({
      id: domains.id,
      name: domains.name,
      expiresAt: domains.expiresAt,
      autoCheckExpiry: domains.autoCheckExpiry,
      expiryRemindDays: domains.expiryRemindDays,
      status: domains.status,
    })
    .from(domains)
    .where(
      and(
        eq(domains.autoCheckExpiry, true),
        isNotNull(domains.expiresAt),
      ),
    );

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  for (const domain of domainList) {
    if (!domain.expiresAt) continue;

    const expiresAt = new Date(domain.expiresAt);
    expiresAt.setHours(0, 0, 0, 0);

    const diffMs = expiresAt.getTime() - now.getTime();
    const daysUntilExpiry = Math.round(diffMs / (1000 * 60 * 60 * 24));

    const remindDays = domain.expiryRemindDays ?? DEFAULT_EXPIRY_REMIND_DAYS;

    if (remindDays.includes(daysUntilExpiry)) {
      const isExpired = daysUntilExpiry <= 0;
      const event = isExpired ? 'domain.expired' : 'domain.expiring';

      await triggerNotification(event, {
        title: isExpired
          ? `域名已过期: ${domain.name}`
          : `域名即将过期: ${domain.name}`,
        content: isExpired
          ? `域名 ${domain.name} 已于今日过期，请及时处理。`
          : `域名 ${domain.name} 将在 ${daysUntilExpiry} 天后过期（${expiresAt.toLocaleDateString('zh-CN')}），请及时续费。`,
        level: isExpired ? 'critical' : 'warning',
        metadata: {
          domainId: domain.id,
          domainName: domain.name,
          daysUntilExpiry,
          expiresAt: domain.expiresAt,
        },
      });
    }

    if (daysUntilExpiry <= 0 && domain.status !== 'expired') {
      await db
        .update(domains)
        .set({ status: 'expired', updatedAt: new Date() })
        .where(eq(domains.id, domain.id));
    }
  }
}
