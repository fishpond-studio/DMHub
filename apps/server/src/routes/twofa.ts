import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, require2FA, requireRole } from '../middleware/auth.js';
import { config } from '../config/index.js';
import { verifyToken, type AccessPayload, type TwoFAPayload } from '../lib/jwt.js';
import {
  setupTotp,
  verifyTotpSetup,
  verify2FALogin,
  regenerateBackupCodes,
  generateBackupCodesZip,
  getUserPasskeys,
  generatePasskeyRegOptions,
  verifyPasskeyRegistration,
  generatePasskeyAuthOptions,
  verifyPasskeyAuth,
  deletePasskey,
  sendEmail2FACode,
  verifyEmail2FASetup,
  getAdminListForReset,
  requestAdminReset,
  verifyAdminResetEmail,
  getPendingAdminResetRequests,
  approveAdminResetRequest,
  rejectAdminResetRequest,
  applyAdminReset,
} from '../services/twofa.js';

function extractUserId(request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  try {
    const payload = verifyToken(token);
    if ('scope' in payload && (payload as TwoFAPayload).scope === '2fa') {
      return (payload as TwoFAPayload).userId;
    }
    const accessPayload = payload as AccessPayload;
    return accessPayload.userId;
  } catch {
    return null;
  }
}

export async function twofaRoutes(app: FastifyInstance) {
  app.get('/methods', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = extractUserId(request);
    if (!userId) {
      return reply.status(401).send({ error: '未认证' });
    }
    try {
      const { getDb } = await import('../db/index.js');
      const { users } = await import('../db/schema.js');
      const { eq } = await import('drizzle-orm');
      const [user] = await getDb().select({ twoFactorMethods: users.twoFactorMethods }).from(users).where(eq(users.id, userId)).limit(1);
      return { twoFactorMethods: user?.twoFactorMethods || [] };
    } catch {
      return { twoFactorMethods: [] };
    }
  });

  app.post('/totp/setup', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await setupTotp(request.user!.userId);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post('/totp/verify', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { code } = request.body as { code?: string };
    if (!code) {
      return reply.status(400).send({ error: '请输入验证码' });
    }
    try {
      const result = await verifyTotpSetup(request.user!.userId, code);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post('/verify', {
    preHandler: [require2FA],
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { method, code } = request.body as { method?: 'totp' | 'backup' | 'email'; code?: string };
    if (!method || !code) {
      return reply.status(400).send({ error: '请提供验证方式和验证码' });
    }
    if (method !== 'totp' && method !== 'backup' && method !== 'email') {
      return reply.status(400).send({ error: '无效的验证方式' });
    }
    try {
      const deviceInfo = request.headers['user-agent'] as string | undefined;
      const result = await verify2FALogin(request.user!.userId, method, code, deviceInfo, request.ip, request.headers['user-agent']);
      reply.setCookie('refresh_token', result.refreshToken, {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: config.NODE_ENV === 'production' ? 'strict' : 'lax',
        path: '/api/auth',
        maxAge: 7 * 24 * 60 * 60,
      });
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.get('/backup-codes/download', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { buffer, filename } = await generateBackupCodesZip(request.user!.userId);
      reply.header('Content-Type', 'application/zip');
      reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      return reply.send(buffer);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post('/backup-codes/regenerate', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const codes = await regenerateBackupCodes(request.user!.userId);
      return { backupCodes: codes };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.get('/backup-codes/admin-reset/admins', { preHandler: [require2FA] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const admins = await getAdminListForReset(request.user!.userId);
      return { admins };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post('/backup-codes/admin-reset/request', { preHandler: [require2FA] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { adminId, alternateEmail } = request.body as { adminId?: string; alternateEmail?: string };
    if (!adminId || !alternateEmail) {
      return reply.status(400).send({ error: '请提供管理员ID和备用邮箱' });
    }
    try {
      const result = await requestAdminReset(request.user!.userId, adminId, alternateEmail);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post('/backup-codes/admin-reset/verify-email', { preHandler: [require2FA] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { requestId, code } = request.body as { requestId?: string; code?: string };
    if (!requestId || !code) {
      return reply.status(400).send({ error: '请提供请求ID和验证码' });
    }
    try {
      const result = await verifyAdminResetEmail(requestId, code);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.get('/backup-codes/admin-reset/pending', { preHandler: [authenticate, requireRole('admin')] }, async (_request: FastifyRequest, _reply: FastifyReply) => {
    const requests = await getPendingAdminResetRequests();
    return { requests };
  });

  app.post('/backup-codes/admin-reset/:requestId/approve', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { requestId } = request.params as { requestId: string };
    try {
      const result = await approveAdminResetRequest(requestId);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post('/backup-codes/admin-reset/:requestId/reject', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { requestId } = request.params as { requestId: string };
    const { reason } = request.body as { reason?: string };
    try {
      const result = await rejectAdminResetRequest(requestId, reason);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post('/backup-codes/admin-reset/apply', { preHandler: [require2FA] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { resetCode } = request.body as { resetCode?: string };
    if (!resetCode) {
      return reply.status(400).send({ error: '请提供重置码' });
    }
    try {
      const result = await applyAdminReset(request.user!.userId, resetCode);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.get('/passkeys', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const passkeys = await getUserPasskeys(request.user!.userId);
      return { passkeys };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post('/passkey/register-options', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const options = await generatePasskeyRegOptions(request.user!.userId, request.hostname);
      return options;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post('/passkey/register-verify', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { response?: any; deviceName?: string };
    if (!body.response) {
      return reply.status(400).send({ error: '缺少验证响应' });
    }
    try {
      const result = await verifyPasskeyRegistration(request.user!.userId, body.response, request.hostname, body.deviceName);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post('/passkey/auth-options', { preHandler: [require2FA] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const options = await generatePasskeyAuthOptions(request.user!.userId, request.hostname);
      return options;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post('/passkey/auth-verify', { preHandler: [require2FA] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { response?: any };
    if (!body.response) {
      return reply.status(400).send({ error: '缺少验证响应' });
    }
    try {
      const deviceInfo = request.headers['user-agent'] as string | undefined;
      const result = await verifyPasskeyAuth(
        request.user!.userId, body.response, request.hostname,
        deviceInfo, request.ip, request.headers['user-agent'],
      );
      reply.setCookie('refresh_token', result.refreshToken, {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/api/auth',
        maxAge: 7 * 24 * 60 * 60,
      });
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.delete('/passkey/:id', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    try {
      await deletePasskey(request.user!.userId, id);
      return { success: true };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post('/email/send', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = extractUserId(request);
    if (!userId) {
      return reply.status(401).send({ error: '未认证' });
    }
    try {
      const result = await sendEmail2FACode(userId);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post('/email/setup-verify', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { code } = request.body as { code?: string };
    if (!code) {
      return reply.status(400).send({ error: '请输入验证码' });
    }
    try {
      const result = await verifyEmail2FASetup(request.user!.userId, code);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
