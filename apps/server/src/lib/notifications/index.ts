import type { NotificationLevel } from '@dmhub/shared';
import { emailChannel } from './email.js';
import { dingtalkChannel } from './dingtalk.js';
import { feishuChannel } from './feishu.js';
import { webhookChannel } from './webhook.js';

export interface NotificationMessage {
  title: string;
  content: string;
  level: NotificationLevel;
  metadata?: Record<string, unknown>;
}

export interface NotificationChannel {
  id: string;
  send(message: NotificationMessage, config: Record<string, unknown>): Promise<void>;
}

const channels: NotificationChannel[] = [
  emailChannel,
  dingtalkChannel,
  feishuChannel,
  webhookChannel,
];

export function getChannel(id: string): NotificationChannel | undefined {
  return channels.find((c: { id: string }) => c.id === id);
}

export async function dispatch(
  channelIds: string[],
  message: NotificationMessage,
  configs: Record<string, Record<string, unknown>>,
): Promise<void> {
  const promises = channelIds.map(async (id: string) => {
    const channel = getChannel(id);
    if (!channel) return;
    try {
      await channel.send(message, configs[id] ?? {});
    } catch (err) {
      console.error(`Notification channel "${id}" failed:`, err);
    }
  });
  await Promise.allSettled(promises);
}
