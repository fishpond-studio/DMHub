import type { NotificationChannel, NotificationMessage } from './index.js';
import { sendMail, type SmtpConfig } from '../smtp.js';
import { getTeamSettings } from '../../services/team.js';
import { getDb } from '../../db/index.js';
import { teamSettings } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { decrypt } from '../crypto.js';

export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const settings = await getTeamSettings();
  if (!settings?.smtpHost) return null;

  const db = getDb();
  const [row] = await db
    .select({ smtpPassword: teamSettings.smtpPassword })
    .from(teamSettings)
    .where(eq(teamSettings.id, 1))
    .limit(1);

  const password = (() => {
    try { return decrypt(row?.smtpPassword || ''); } catch { return row?.smtpPassword || ''; }
  })();

  return {
    host: settings.smtpHost,
    port: settings.smtpPort ?? 465,
    user: settings.smtpUser ?? '',
    password,
    from: settings.smtpFrom ?? '',
    secure: settings.smtpSecure ?? false,
  };
}

function buildEmailHtml(message: NotificationMessage): string {
  const accent =
    message.level === 'critical' ? '#dc2626' : message.level === 'warning' ? '#d97706' : '#2563eb';
  const contentHtml = String(message.content || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br/>');
  const titleHtml = String(message.title || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <div style="border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
        <div style="background: ${accent}; padding: 16px 20px;">
          <h2 style="margin: 0; color: #fff; font-size: 18px; font-weight: 600;">${titleHtml}</h2>
        </div>
        <div style="padding: 20px; background: #fff;">
          <p style="margin: 0; color: #374151; font-size: 14px; line-height: 1.6;">${contentHtml}</p>
        </div>
        <div style="padding: 12px 20px; background: #f9fafb; border-top: 1px solid #e5e7eb;">
          <p style="margin: 0; color: #9ca3af; font-size: 12px;">此邮件由 DMHub 自动发送 · 可在个人资料中关闭邮件通知</p>
        </div>
      </div>
    </div>
  `;
}

/**
 * 向单个用户邮箱发送通知（需团队已配置 SMTP）。
 */
export async function sendUserNotificationEmail(
  to: string,
  message: NotificationMessage,
): Promise<{ success: boolean; error?: string }> {
  const smtpConfig = await getSmtpConfig();
  if (!smtpConfig) {
    return { success: false, error: 'SMTP 未配置' };
  }
  const subject = `[DMHub] ${message.title}`;
  return sendMail(smtpConfig, to, subject, buildEmailHtml(message));
}

export const emailChannel: NotificationChannel = {
  id: 'email',
  async send(message: NotificationMessage, config: Record<string, unknown>) {
    const smtpConfig = await getSmtpConfig();
    if (!smtpConfig) {
      console.error('Email channel: SMTP not configured');
      return;
    }

    const emailList = (config.recipients as string[]) ?? [];
    if (emailList.length === 0) return;

    const subject = `[DMHub] ${message.title}`;
    const html = buildEmailHtml(message);

    for (const to of emailList) {
      const result = await sendMail(smtpConfig, to, subject, html);
      if (!result.success) {
        console.error(`Failed to send email to ${to}: ${result.error}`);
      }
    }
  },
};
