import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { notificationConfigs, users } from '../db/schema.js';
import type { NotificationMessage } from '../lib/notifications/index.js';
import { dispatch } from '../lib/notifications/index.js';

const SSE_CLIENTS = new Map<string, Set<{
  send: (data: string) => void;
}>>();

const NOTIFICATION_STORE = new Map<string, Array<{
  id: string;
  title: string;
  content: string;
  level: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}>>();

const MAX_STORED_PER_USER = 100;

export function addSSEClient(userId: string, client: { send: (data: string) => void }) {
  if (!SSE_CLIENTS.has(userId)) {
    SSE_CLIENTS.set(userId, new Set());
  }
  SSE_CLIENTS.get(userId)!.add(client);
}

export function getSSEClientCount(userId: string): number {
  return SSE_CLIENTS.get(userId)?.size ?? 0;
}

export function removeSSEClient(userId: string, client: { send: (data: string) => void }) {
  SSE_CLIENTS.get(userId)?.delete(client);
  if (SSE_CLIENTS.get(userId)?.size === 0) {
    SSE_CLIENTS.delete(userId);
  }
}

export function getStoredNotifications(userId: string) {
  return NOTIFICATION_STORE.get(userId) ?? [];
}

function storeNotification(userId: string, notification: {
  id: string;
  title: string;
  content: string;
  level: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}) {
  if (!NOTIFICATION_STORE.has(userId)) {
    NOTIFICATION_STORE.set(userId, []);
  }
  const store = NOTIFICATION_STORE.get(userId)!;
  store.unshift(notification);
  if (store.length > MAX_STORED_PER_USER) {
    store.length = MAX_STORED_PER_USER;
  }
}

export async function triggerNotification(event: string, message: NotificationMessage) {
  const db = getDb();
  const allConfigs = await db
    .select()
    .from(notificationConfigs)
    .where(eq(notificationConfigs.enabled, true));

  const matchingConfigs = allConfigs.filter((c: { events: string[]; channel: string; config: unknown }) => c.events.includes(event));

  if (matchingConfigs.length === 0) return;

  const channelConfigs: Record<string, Record<string, unknown>> = {};
  const channelIds: string[] = [];

  for (const cfg of matchingConfigs) {
    if (!channelIds.includes(cfg.channel)) {
      channelIds.push(cfg.channel);
    }
    channelConfigs[cfg.channel] = cfg.config as Record<string, unknown>;
  }

  await dispatch(channelIds, message, channelConfigs);

  const notification = {
    id: crypto.randomUUID(),
    title: message.title,
    content: message.content,
    level: message.level,
    metadata: message.metadata,
    createdAt: new Date().toISOString(),
  };

  const enabledAdmins = await db
    .select({ id: users.id, notificationsEnabled: users.notificationsEnabled })
    .from(users)
    .where(eq(users.role, 'admin'));

  const storedAdminIds: string[] = [];
  for (const admin of enabledAdmins) {
    if (admin.notificationsEnabled !== false) {
      storeNotification(admin.id, notification);
      storedAdminIds.push(admin.id);
    }
  }

  const sseData = `data: ${JSON.stringify({ event, ...notification })}\n\n`;
  for (const userId of storedAdminIds) {
    const clients = SSE_CLIENTS.get(userId);
    if (clients) {
      for (const client of clients) {
        try {
          client.send(sseData);
        } catch {}
      }
    }
  }
}

/**
 * 向所有启用通知的管理员推送站内消息（SSE + 存储），不依赖 notification_configs 的 events 配置。
 * 用于配置变更等"管理员必须知道"的关键事件。
 */
export async function notifyAdmins(event: string, message: NotificationMessage) {
  const db = getDb();
  const admins = await db
    .select({ id: users.id, notificationsEnabled: users.notificationsEnabled })
    .from(users)
    .where(eq(users.role, 'admin'));

  const notification = {
    id: crypto.randomUUID(),
    title: message.title,
    content: message.content,
    level: message.level,
    metadata: message.metadata,
    createdAt: new Date().toISOString(),
  };

  const targets: string[] = [];
  for (const admin of admins) {
    if (admin.notificationsEnabled !== false) {
      storeNotification(admin.id, notification);
      targets.push(admin.id);
    }
  }

  const sseData = `data: ${JSON.stringify({ event, ...notification })}\n\n`;
  for (const userId of targets) {
    const clients = SSE_CLIENTS.get(userId);
    if (clients) {
      for (const client of clients) {
        try {
          client.send(sseData);
        } catch {}
      }
    }
  }
}
