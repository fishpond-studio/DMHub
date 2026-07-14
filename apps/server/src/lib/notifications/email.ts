import type { NotificationChannel, NotificationMessage } from './index.js';
import { sendMail, type SmtpConfig } from '../smtp.js';
import { getTeamSettings } from '../../services/team.js';
import { getDb } from '../../db/index.js';
import { teamSettings } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { decrypt } from '../crypto.js';

async function getSmtpConfig(): Promise<SmtpConfig | null> {
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
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: ${message.level === 'critical' ? '#dc2626' : message.level === 'warning' ? '#d97706' : '#2563eb'};">${message.title}</h2>
        <p style="color: #374151; font-size: 14px;">${message.content}</p>
        <hr style="border-color: #e5e7eb; margin: 16px 0;" />
        <p style="color: #9ca3af; font-size: 12px;">此邮件由 DMHub 通知系统自动发送</p>
      </div>
    `;

    for (const to of emailList) {
      const result = await sendMail(smtpConfig, to, subject, html);
      if (!result.success) {
        console.error(`Failed to send email to ${to}: ${result.error}`);
      }
    }
  },
};
