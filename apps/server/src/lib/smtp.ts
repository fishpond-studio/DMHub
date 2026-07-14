import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
  secure: boolean;
}

export function createTransport(config: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure ?? config.port === 465,
    auth: {
      user: config.user,
      pass: config.password,
    },
  });
}

export async function testSmtpConnection(config: SmtpConfig): Promise<{ success: boolean; error?: string }> {
  try {
    const transporter = createTransport(config);
    await transporter.verify();
    await transporter.close();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'SMTP connection failed' };
  }
}

export async function sendMail(
  config: SmtpConfig,
  to: string,
  subject: string,
  html: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const transporter = createTransport(config);
    await transporter.sendMail({
      from: config.from,
      to,
      subject,
      html,
    });
    await transporter.close();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to send email' };
  }
}
