import cron from 'node-cron';
import { eq, and, isNotNull } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { domains } from '../db/schema.js';
import { EXPIRY_CHECK_CRON, DEFAULT_EXPIRY_REMIND_DAYS } from '@dmhub/shared';
import { triggerNotification } from '../services/notification.js';

let cronJob: cron.ScheduledTask | null = null;

export function startExpiryCheckCron() {
  if (cronJob) return;

  cronJob = cron.schedule(EXPIRY_CHECK_CRON, async () => {
    console.log('[Cron] Running expiry check...');
    await checkDomainExpiry();
  });

  console.log(`[Cron] Expiry check scheduled: ${EXPIRY_CHECK_CRON}`);
}

export function stopExpiryCheckCron() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
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
