import crypto from 'crypto';
import type { NotificationChannel, NotificationMessage } from './index.js';
import { isPublicDomain, safeFetch } from '../ssrf-guard.js';

export const dingtalkChannel: NotificationChannel = {
  id: 'dingtalk',
  async send(message: NotificationMessage, config: Record<string, unknown>) {
    const webhookUrl = config.webhookUrl as string;
    if (!webhookUrl) {
      console.error('DingTalk channel: webhookUrl not configured');
      return;
    }

    try {
      const urlObj = new URL(webhookUrl);
      const safe = await isPublicDomain(urlObj.hostname);
      if (!safe) {
        console.error('DingTalk channel: SSRF blocked for', urlObj.hostname);
        return;
      }
    } catch {
      console.error('DingTalk channel: invalid webhookUrl');
      return;
    }

    const body = {
      msgtype: 'markdown',
      markdown: {
        title: message.title,
        text: `### ${message.title}\n\n${message.content}\n\n> 级别: ${message.level}`,
      },
    };

    const jsonBody = JSON.stringify(body);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const secret = config.secret as string | undefined;
    let url = webhookUrl;
    if (secret) {
      const timestamp = Date.now();
      const stringToSign = `${timestamp}\n${secret}`;
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(stringToSign);
      const sign = encodeURIComponent(hmac.digest('base64'));
      url = `${webhookUrl}&timestamp=${timestamp}&sign=${sign}`;
    }

    const response = await safeFetch(url, {
      method: 'POST',
      headers,
      body: jsonBody,
    });

    if (!response.ok) {
      throw new Error(`DingTalk webhook failed: ${response.status}`);
    }
  },
};
