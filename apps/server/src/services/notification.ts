import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { notificationConfigs, users } from '../db/schema.js';
import type { NotificationMessage } from '../lib/notifications/index.js';
import { dispatch } from '../lib/notifications/index.js';
import { sendUserNotificationEmail } from '../lib/notifications/email.js';

export interface StoredNotification {
  id: string;
  event?: string;
  title: string;
  content: string;
  level: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  read: boolean;
}

const SSE_CLIENTS = new Map<string, Set<{
  send: (data: string) => void;
}>>();

const NOTIFICATION_STORE = new Map<string, StoredNotification[]>();

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

export function getStoredNotifications(userId: string): StoredNotification[] {
  return NOTIFICATION_STORE.get(userId) ?? [];
}

export function getUnreadCount(userId: string): number {
  return getStoredNotifications(userId).filter((n) => !n.read).length;
}

function storeNotification(userId: string, notification: StoredNotification) {
  if (!NOTIFICATION_STORE.has(userId)) {
    NOTIFICATION_STORE.set(userId, []);
  }
  const store = NOTIFICATION_STORE.get(userId)!;
  store.unshift(notification);
  if (store.length > MAX_STORED_PER_USER) {
    store.length = MAX_STORED_PER_USER;
  }
}

function pushSSE(userId: string, payload: Record<string, unknown>) {
  const clients = SSE_CLIENTS.get(userId);
  if (!clients) return;
  const sseData = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients) {
    try {
      client.send(sseData);
    } catch {
      // client disconnected
    }
  }
}

function buildStored(event: string, message: NotificationMessage): StoredNotification {
  return {
    id: crypto.randomUUID(),
    event,
    title: message.title,
    content: message.content,
    level: message.level,
    metadata: message.metadata,
    createdAt: new Date().toISOString(),
    read: false,
  };
}

export interface NotifyUserOptions {
  /** 忽略站内通知开关（管理员关键事件） */
  force?: boolean;
  /**
   * 是否尝试邮件（默认 true）。
   * 仍需用户开启 emailNotificationsEnabled，且已绑定邮箱、团队已配置 SMTP。
   */
  email?: boolean;
}

/**
 * 向指定用户推送站内信（存储 + SSE），可选邮件。
 * - 站内：尊重 notificationsEnabled（force 可覆盖）
 * - 邮件：尊重 emailNotificationsEnabled（可选，默认关）
 */
export async function notifyUser(
  userId: string,
  event: string,
  message: NotificationMessage,
  options?: NotifyUserOptions,
) {
  const db = getDb();
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      notificationsEnabled: users.notificationsEnabled,
      emailNotificationsEnabled: users.emailNotificationsEnabled,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return;

  const allowInApp = options?.force || user.notificationsEnabled !== false;
  if (allowInApp) {
    const notification = buildStored(event, message);
    storeNotification(userId, notification);
    pushSSE(userId, { event, ...notification });
  }

  const wantEmail = options?.email !== false;
  if (
    wantEmail &&
    user.emailNotificationsEnabled &&
    user.email
  ) {
    // 异步发信，不阻塞主流程
    void sendUserNotificationEmail(user.email, message).then((result) => {
      if (!result.success) {
        console.warn(
          `[notify] email to ${user.email} failed: ${result.error || 'unknown'}`,
        );
      }
    });
  }
}

/**
 * 向多个用户推送同一条站内信（每人独立 id）。
 */
export async function notifyUsers(
  userIds: string[],
  event: string,
  message: NotificationMessage,
  options?: NotifyUserOptions,
) {
  const unique = [...new Set(userIds.filter(Boolean))];
  await Promise.all(unique.map((id) => notifyUser(id, event, message, options)));
}

export function markNotificationRead(userId: string, notificationId: string): boolean {
  const store = NOTIFICATION_STORE.get(userId);
  if (!store) return false;
  const item = store.find((n) => n.id === notificationId);
  if (!item) return false;
  item.read = true;
  return true;
}

export function markAllNotificationsRead(userId: string): number {
  const store = NOTIFICATION_STORE.get(userId);
  if (!store) return 0;
  let count = 0;
  for (const n of store) {
    if (!n.read) {
      n.read = true;
      count++;
    }
  }
  return count;
}

export function deleteStoredNotification(userId: string, notificationId: string): boolean {
  const store = NOTIFICATION_STORE.get(userId);
  if (!store) return false;
  const idx = store.findIndex((n) => n.id === notificationId);
  if (idx === -1) return false;
  store.splice(idx, 1);
  return true;
}

export function clearStoredNotifications(userId: string): number {
  const store = NOTIFICATION_STORE.get(userId);
  if (!store) return 0;
  const n = store.length;
  NOTIFICATION_STORE.set(userId, []);
  return n;
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

  // 站内信：有 web 渠道配置时推送给管理员；始终按 configs 触发的外部渠道已在上方 dispatch
  const hasWeb = channelIds.includes('web');
  if (hasWeb || channelIds.length > 0) {
    // 外部渠道已发送；站内信默认推给管理员，保证操作可见
    await notifyAdmins(event, message);
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

  const targets = admins
    .filter((a: { notificationsEnabled: boolean | null }) => a.notificationsEnabled !== false)
    .map((a: { id: string }) => a.id);

  await notifyUsers(targets, event, message, { force: true });
}
