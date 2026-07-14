import crypto from 'crypto';
import type { NotificationChannel, NotificationMessage } from './index.js';
import { isPublicDomain } from '../ssrf-guard.js';

export const feishuChannel: NotificationChannel = {
  id: 'feishu',
  async send(message: NotificationMessage, config: Record<string, unknown>) {
    const webhookUrl = config.webhookUrl as string;
    if (!webhookUrl) {
      console.error('Feishu channel: webhookUrl not configured');
      return;
    }

    try {
      const urlObj = new URL(webhookUrl);
      const safe = await isPublicDomain(urlObj.hostname);
      if (!safe) {
        console.error('Feishu channel: SSRF blocked for', urlObj.hostname);
        return;
      }
    } catch {
      console.error('Feishu channel: invalid webhookUrl');
      return;
    }

    const body = {
      msg_type: 'interactive',
      card: {
        header: {
          title: {
            tag: 'plain_text',
            content: message.title,
          },
          template: message.level === 'critical' ? 'red' : message.level === 'warning' ? 'orange' : 'blue',
        },
        elements: [
          {
            tag: 'markdown',
            content: message.content,
          },
        ],
      },
    };

    const jsonBody = JSON.stringify(body);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const secret = config.secret as string | undefined;
    if (secret) {
      const timestamp = Math.floor(Date.now() / 1000);
      const stringToSign = `${timestamp}\n${jsonBody}`;
      const hmac = crypto.createHmac('sha256', secret);
      const sign = hmac.update(stringToSign).digest('base64');
      headers['X-Lark-Signature'] = `${timestamp}:${sign}`;
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: jsonBody,
    });

    if (!response.ok) {
      throw new Error(`Feishu webhook failed: ${response.status}`);
    }
  },
};
