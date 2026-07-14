import crypto from 'crypto';
import type { NotificationChannel, NotificationMessage } from './index.js';
import { isPublicDomain } from '../ssrf-guard.js';

export const webhookChannel: NotificationChannel = {
  id: 'webhook',
  async send(message: NotificationMessage, config: Record<string, unknown>) {
    const webhookUrl = config.webhookUrl as string;
    if (!webhookUrl) {
      console.error('Webhook channel: webhookUrl not configured');
      return;
    }

    try {
      const urlObj = new URL(webhookUrl);
      const safe = await isPublicDomain(urlObj.hostname);
      if (!safe) {
        console.error('Webhook channel: SSRF blocked for', urlObj.hostname);
        return;
      }
    } catch {
      console.error('Webhook channel: invalid webhookUrl');
      return;
    }

    const secret = config.secret as string | undefined;
    const body = {
      title: message.title,
      content: message.content,
      level: message.level,
      metadata: message.metadata,
      timestamp: new Date().toISOString(),
    };

    const jsonBody = JSON.stringify(body);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (secret) {
      const signature = crypto.createHmac('sha256', secret).update(jsonBody).digest('hex');
      headers['X-Hub-Signature-256'] = `sha256=${signature}`;
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: jsonBody,
    });

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status}`);
    }
  },
};
