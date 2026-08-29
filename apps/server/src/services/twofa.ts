import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { users, userTotpSeeds, backupCodes, refreshTokens, userPasskeys, teamSettings } from '../db/schema.js';
import { encrypt, decrypt } from '../lib/crypto.js';
import { generateTotpSecret, verifyTotpCode } from '../lib/totp.js';
import { signAccessToken, signRefreshToken } from '../lib/jwt.js';
import { BACKUP_CODE_COUNT } from '@dmhub/shared';
import { logOperation } from '../lib/log.js';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { getWebAuthnConfig, storeChallenge, getChallenge, deleteChallenge } from '../lib/webauthn.js';
import { generateEmailCode, storeEmailCode, verifyEmailCodeEntry } from '../lib/email-code-store.js';
import { sendMail } from '../lib/smtp.js';
import {
  createResetRequest,
  getResetRequest,
  verifyResetEmail,
  approveResetRequest,
  rejectResetRequest,
  getPendingRequests,
  validateResetCode,
} from '../lib/admin-reset-store.js';
import { triggerNotification } from './notification.js';

function generateSingleBackupCode(): string {
  const part1 = crypto.randomBytes(3).toString('hex').toUpperCase();
  const part2 = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${part1}-${part2}`;
}

export function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    codes.push(generateSingleBackupCode());
  }
  return codes;
}

async function storeBackupCodes(userId: string, plainCodes: string[]): Promise<void> {
  const db = getDb();
  const values = [];
  for (let i = 0; i < plainCodes.length; i++) {
    const hash = await bcrypt.hash(plainCodes[i], 10);
    values.push({
      userId,
      codeHash: hash,
      codeIndex: i + 1,
    });
  }
  await db.insert(backupCodes).values(values);
}

async function addMethodAndEnable(userId: string, method: string): Promise<string[] | undefined> {
  const db = getDb();
  const [user] = await db.select({ twoFactorMethods: users.twoFactorMethods })
    .from(users).where(eq(users.id, userId)).limit(1);
  const methods = [...(user?.twoFactorMethods || [])];
  if (!methods.includes(method)) methods.push(method);

  const isFirst = !user?.twoFactorMethods || user.twoFactorMethods.length === 0;
  let newCodes: string[] | undefined;
  if (isFirst) {
    newCodes = generateBackupCodes();
    await storeBackupCodes(userId, newCodes);
  }

  await db.update(users).set({
    twoFactorEnabled: true,
    twoFactorMethods: methods,
    updatedAt: new Date(),
  }).where(eq(users.id, userId));

  return newCodes;
}

export async function setupTotp(userId: string): Promise<{ otpauthUri: string; secret: string }> {
  const db = getDb();

  const [user] = await db.select({ username: users.username }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) {
    throw new Error('用户不存在');
  }

  const { secret, otpauthUri } = generateTotpSecret(user.username);

  const encryptedSecret = encrypt(secret);

  const [existing] = await db.select({ id: userTotpSeeds.id, verified: userTotpSeeds.verified }).from(userTotpSeeds).where(eq(userTotpSeeds.userId, userId)).limit(1);

  if (existing?.verified) {
    throw new Error('TOTP 已设置，如需重新设置请先禁用');
  }

  if (existing) {
    await db.update(userTotpSeeds).set({ secretEncrypted: encryptedSecret, verified: false }).where(eq(userTotpSeeds.id, existing.id));
  } else {
    await db.insert(userTotpSeeds).values({
      userId,
      secretEncrypted: encryptedSecret,
      verified: false,
    });
  }

  return { otpauthUri, secret };
}

export async function verifyTotpSetup(userId: string, code: string): Promise<{ verified: boolean; backupCodes: string[] }> {
  const db = getDb();

  const [seed] = await db.select().from(userTotpSeeds).where(eq(userTotpSeeds.userId, userId)).limit(1);
  if (!seed) {
    throw new Error('请先设置 TOTP');
  }
  if (seed.verified) {
    throw new Error('TOTP 已验证');
  }

  const secretBase32 = decrypt(seed.secretEncrypted);
  const valid = verifyTotpCode(secretBase32, code);
  if (!valid) {
    throw new Error('验证码错误');
  }

  await db.update(userTotpSeeds).set({ verified: true }).where(eq(userTotpSeeds.id, seed.id));

  const backupCodesResult = await addMethodAndEnable(userId, 'totp');

  return { verified: true, backupCodes: backupCodesResult || [] };
}

export async function verify2FALogin(userId: string, method: 'totp' | 'backup' | 'email', code: string, deviceInfo?: string, ipAddress?: string, userAgent?: string): Promise<{
  accessToken: string;
  refreshToken: string;
  user: { id: string; username: string | null; email: string | null; role: string };
  backupCodesWarning?: string;
}> {
  const db = getDb();

  const [user] = await db.select({
    id: users.id,
    username: users.username,
    email: users.email,
    role: users.role,
    twoFactorMethods: users.twoFactorMethods,
  }).from(users).where(eq(users.id, userId)).limit(1);

  if (!user) {
    throw new Error('用户不存在');
  }

  if (method === 'totp') {
    const [seed] = await db.select().from(userTotpSeeds).where(eq(userTotpSeeds.userId, userId)).limit(1);
    if (!seed || !seed.verified) {
      throw new Error('TOTP 未设置');
    }
    const secretBase32 = decrypt(seed.secretEncrypted);
    const valid = verifyTotpCode(secretBase32, code);
    if (!valid) {
    throw new Error('验证码错误');
    }
  } else if (method === 'backup') {
    const allCodes = await db.select().from(backupCodes).where(
      and(eq(backupCodes.userId, userId), eq(backupCodes.used, false))
    );

    let matched = false;
    for (const bc of allCodes) {
      const valid = await bcrypt.compare(code.toUpperCase(), bc.codeHash);
      if (valid) {
        await db.update(backupCodes).set({ used: true, usedAt: new Date() }).where(eq(backupCodes.id, bc.id));
        matched = true;
        break;
      }
    }
    if (!matched) {
      throw new Error('备用码无效或已使用');
    }
  } else if (method === 'email') {
    const valid = await verifyEmailCodeEntry(userId, code);
    if (!valid) {
      throw new Error('验证码错误或已过期');
    }
  }

  const accessToken = signAccessToken(user.id, user.role);
  const refreshToken = signRefreshToken(user.id);

  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  await db.insert(refreshTokens).values({
    userId,
    tokenHash,
    deviceInfo: deviceInfo ? deviceInfo.slice(0, 255) : null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  let backupCodesWarning: string | undefined;

  {
    const remaining = await db.select({ id: backupCodes.id }).from(backupCodes).where(
      and(eq(backupCodes.userId, userId), eq(backupCodes.used, false))
    );
    const count = remaining.length;
    if (count === 0) {
      backupCodesWarning = '所有备用码已用完，请立即生成新的备用码';
    } else if (count <= 2) {
      backupCodesWarning = `仅剩 ${count} 个备用码，建议尽快生成新的备用码`;
    }
  }

  await logOperation({
    userId,
    action: 'login_2fa',
    targetType: 'user',
    targetId: userId,
    detail: { method, username: user.username },
    ipAddress,
    userAgent,
  });

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, username: user.username, email: user.email, role: user.role },
    backupCodesWarning,
  };
}

export async function regenerateBackupCodes(userId: string): Promise<string[]> {
  const db = getDb();

  const [user] = await db.select({ twoFactorEnabled: users.twoFactorEnabled }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !user.twoFactorEnabled) {
    throw new Error('请先启用 2FA');
  }

  await db.delete(backupCodes).where(eq(backupCodes.userId, userId));

  const plainCodes = generateBackupCodes();
  await storeBackupCodes(userId, plainCodes);

  return plainCodes;
}

export async function generateBackupCodesZip(userId: string): Promise<{ buffer: Buffer; filename: string }> {
  const db = getDb();

  const [user] = await db.select({
    username: users.username,
    email: users.email,
  }).from(users).where(eq(users.id, userId)).limit(1);

  if (!user) {
    throw new Error('用户不存在');
  }

  const plainCodes = await regenerateBackupCodes(userId);

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '-');

  const mdContent = [
    `# DMHub 备用代码`,
    ``,
    `⚠️ 请安全保管，切勿外传！泄露备用代码将导致账户安全风险！`,
    ``,
    `- 用户名：${user.username}`,
    `- 邮箱：${user.email || '未设置'}`,
    `- 生成时间：${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
    ``,
    `## 备用代码`,
    ``,
    ...plainCodes.map((code, i) => `${i + 1}. ${code}`),
    ``,
    `⚠️ 每个代码仅可使用一次，用完即失效。请勿将此文件分享给任何人。`,
  ].join('\n');

  const archiverModule = await import('archiver');
  const archiver = archiverModule.default || archiverModule;
  const archive = archiver('zip', { zlib: { level: 9 } });
  const chunks: Buffer[] = [];

  archive.on('data', (chunk: Buffer) => chunks.push(chunk));

  archive.append(mdContent, { name: 'DMHub-backup_codes.md' });
  await archive.finalize();

  const buffer = Buffer.concat(chunks);
  const filename = `${user.username}-backup_codes-${dateStr}-${timeStr}.zip`;

  return { buffer, filename };
}

export async function getUserPasskeys(userId: string) {
  const db = getDb();
  return db.select({
    id: userPasskeys.id,
    deviceName: userPasskeys.deviceName,
    deviceType: userPasskeys.deviceType,
    createdAt: userPasskeys.createdAt,
    lastUsedAt: userPasskeys.lastUsedAt,
  }).from(userPasskeys).where(eq(userPasskeys.userId, userId));
}

export async function generatePasskeyRegOptions(userId: string, hostname?: string): Promise<any> {
  const db = getDb();
  const { rpID, rpName } = await getWebAuthnConfig(hostname);

  const [user] = await db.select({ username: users.username, displayName: users.displayName })
    .from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error('用户不存在');

  const existingPasskeys = await db.select({ credentialId: userPasskeys.credentialId })
    .from(userPasskeys).where(eq(userPasskeys.userId, userId));

  const excludeCredentials = existingPasskeys.map((pk: { credentialId: Buffer }) => ({
    id: pk.credentialId.toString('base64url'),
    type: 'public-key' as const,
  }));

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.username,
    userDisplayName: user.displayName || user.username,
    excludeCredentials,
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });

  await storeChallenge(userId, options.challenge);

  return options;
}

export async function verifyPasskeyRegistration(userId: string, response: any, hostname?: string, deviceName?: string) {
  const db = getDb();
  const { rpID, origin } = await getWebAuthnConfig(hostname);
  const expectedChallenge = await getChallenge(userId);
  if (!expectedChallenge) throw new Error('验证已过期，请重新注册');

  try {
    const result = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    if (!result.verified || !result.registrationInfo) {
      throw new Error('验证失败');
    }

    const { credential, credentialDeviceType, credentialBackedUp } = result.registrationInfo;

    const finalDeviceName = (deviceName ?? '').trim().slice(0, 64) || guessDeviceName(credentialDeviceType);

    await db.insert(userPasskeys).values({
      userId,
      credentialId: Buffer.from(credential.id, 'base64url'),
      publicKey: Buffer.from(credential.publicKey),
      counter: credential.counter,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: credential.transports || [],
      deviceName: finalDeviceName,
    });

    deleteChallenge(userId).catch(() => {});

    const backupCodesResult = await addMethodAndEnable(userId, 'passkey');

    return { verified: true, backupCodes: backupCodesResult };
  } catch (err) {
    deleteChallenge(userId).catch(() => {});
    throw err;
  }
}

export async function generatePasskeyAuthOptions(userId: string, hostname?: string): Promise<any> {
  const db = getDb();
  const { rpID } = await getWebAuthnConfig(hostname);

  const passkeys = await db.select({
    credentialId: userPasskeys.credentialId,
    transports: userPasskeys.transports,
  }).from(userPasskeys).where(eq(userPasskeys.userId, userId));

  const allowCredentials = passkeys.map((pk: { credentialId: Buffer; transports: string[] | null }) => ({
    id: pk.credentialId.toString('base64url'),
    type: 'public-key' as const,
    transports: (pk.transports || []) as any[],
  }));

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials,
    userVerification: 'preferred',
  });

  await storeChallenge(userId, options.challenge);

  return options;
}

export async function verifyPasskeyAuth(userId: string, response: any, hostname?: string, deviceInfo?: string, ipAddress?: string, userAgent?: string) {
  const db = getDb();
  const { rpID, origin } = await getWebAuthnConfig(hostname);
  const expectedChallenge = await getChallenge(userId);
  if (!expectedChallenge) throw new Error('验证已过期，请重新验证');

  const credentialIdBuffer = Buffer.from(response.id, 'base64url');
  const [passkey] = await db.select().from(userPasskeys)
    .where(and(eq(userPasskeys.userId, userId), eq(userPasskeys.credentialId, credentialIdBuffer)))
    .limit(1);

  if (!passkey) throw new Error('通行密钥未找到');

  const credential = {
    id: passkey.credentialId.toString('base64url'),
    publicKey: new Uint8Array(passkey.publicKey),
    counter: passkey.counter,
    transports: (passkey.transports || []) as any[],
  };

  try {
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential,
    });

    if (!result.verified) throw new Error('验证失败');

    await db.update(userPasskeys).set({
      counter: result.authenticationInfo.newCounter,
      lastUsedAt: new Date(),
    }).where(eq(userPasskeys.id, passkey.id));

    deleteChallenge(userId).catch(() => {});

    const [user] = await db.select({
      id: users.id, username: users.username, email: users.email, role: users.role,
    }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new Error('用户不存在');

    const accessToken = signAccessToken(user.id, user.role);
    const refreshToken = signRefreshToken(user.id);

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await db.insert(refreshTokens).values({
      userId, tokenHash,
      deviceInfo: deviceInfo ? deviceInfo.slice(0, 255) : null,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    let backupCodesWarning: string | undefined;
    const remaining = await db.select({ id: backupCodes.id }).from(backupCodes)
      .where(and(eq(backupCodes.userId, userId), eq(backupCodes.used, false)));
    const count = remaining.length;
    if (count === 0) {
      backupCodesWarning = '所有备用码已用完，请立即生成新的备用码';
    } else if (count <= 2) {
      backupCodesWarning = `仅剩 ${count} 个备用码，建议尽快生成新的备用码`;
    }

    await logOperation({
      userId, action: 'login_2fa', targetType: 'user', targetId: userId,
      detail: { method: 'passkey', username: user.username },
      ipAddress, userAgent,
    });

    return {
      accessToken, refreshToken,
      user: { id: user.id, username: user.username, email: user.email, role: user.role },
      backupCodesWarning,
    };
  } catch (err) {
    deleteChallenge(userId).catch(() => {});
    throw err;
  }
}

export async function deletePasskey(userId: string, passkeyId: string) {
  const db = getDb();

  const [passkey] = await db.select().from(userPasskeys)
    .where(and(eq(userPasskeys.id, passkeyId), eq(userPasskeys.userId, userId)))
    .limit(1);
  if (!passkey) throw new Error('通行密钥不存在');

  await db.delete(userPasskeys).where(eq(userPasskeys.id, passkeyId));

  const remainingPasskeys = await db.select({ id: userPasskeys.id })
    .from(userPasskeys).where(eq(userPasskeys.userId, userId));

  const [user] = await db.select({ twoFactorMethods: users.twoFactorMethods })
    .from(users).where(eq(users.id, userId)).limit(1);

  const methods = [...(user?.twoFactorMethods || [])];
  if (remainingPasskeys.length === 0) {
    const idx = methods.indexOf('passkey');
    if (idx !== -1) methods.splice(idx, 1);
  }

  if (methods.length === 0) {
    await db.update(users).set({
      twoFactorEnabled: false,
      twoFactorMethods: [],
      updatedAt: new Date(),
    }).where(eq(users.id, userId));
    await db.delete(backupCodes).where(eq(backupCodes.userId, userId));
  } else {
    await db.update(users).set({
      twoFactorMethods: methods,
      updatedAt: new Date(),
    }).where(eq(users.id, userId));
  }
}

export async function sendEmail2FACode(userId: string) {
  const db = getDb();

  const [user] = await db.select({ email: users.email, emailVerified: users.emailVerified })
    .from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error('用户不存在');
  if (!user.email) throw new Error('请先设置邮箱');
  if (!user.emailVerified) throw new Error('请先验证邮箱');

  const code = generateEmailCode();
  const result = await storeEmailCode(userId, code);
  if (!result.success) throw new Error(result.error!);

  const [smtpRow] = await db.select({
    smtpHost: teamSettings.smtpHost,
    smtpPort: teamSettings.smtpPort,
    smtpUser: teamSettings.smtpUser,
    smtpPassword: teamSettings.smtpPassword,
    smtpFrom: teamSettings.smtpFrom,
    smtpSecure: teamSettings.smtpSecure,
  }).from(teamSettings).where(eq(teamSettings.id, 1));

  if (!smtpRow?.smtpHost) throw new Error('邮件服务未配置');

  const html = `<div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:20px">
<h2 style="text-align:center;color:#1f2937">DMHub 验证码</h2>
<p style="text-align:center;color:#6b7280">您的验证码为：</p>
<div style="text-align:center;font-size:32px;font-weight:bold;letter-spacing:8px;padding:16px;background:#f3f4f6;border-radius:8px;margin:16px 0">${code}</div>
<p style="text-align:center;color:#9ca3af;font-size:14px">验证码在5 分钟内有效，请勿泄露给他人</p>
</div>`;

  const smtpResult = await sendMail({
    host: smtpRow.smtpHost,
    port: smtpRow.smtpPort!,
    user: smtpRow.smtpUser || '',
    password: (() => { try { return decrypt(smtpRow.smtpPassword || ''); } catch { return smtpRow.smtpPassword || ''; } })(),
    from: smtpRow.smtpFrom || '',
    secure: smtpRow.smtpSecure ?? false,
  }, user.email, 'DMHub 验证码', html);

  if (!smtpResult.success) throw new Error('验证码发送失败：' + (smtpResult.error || ''));

  return { sent: true };
}

export async function verifyEmail2FASetup(userId: string, code: string) {
  const valid = await verifyEmailCodeEntry(userId, code);
  if (!valid) throw new Error('验证码错误或已过期');

  const backupCodesResult = await addMethodAndEnable(userId, 'email');

  return { verified: true, backupCodes: backupCodesResult };
}

function guessDeviceName(deviceType: string): string {
  if (deviceType === 'singleDevice') return '平台认证器';
  if (deviceType === 'multiDevice') return '漫游认证器';
  return '未命名设备';
}

async function getSmtpConfig() {
  const db = getDb();
  const [smtpRow] = await db.select({
    smtpHost: teamSettings.smtpHost,
    smtpPort: teamSettings.smtpPort,
    smtpUser: teamSettings.smtpUser,
    smtpPassword: teamSettings.smtpPassword,
    smtpFrom: teamSettings.smtpFrom,
    smtpSecure: teamSettings.smtpSecure,
  }).from(teamSettings).where(eq(teamSettings.id, 1));
  if (!smtpRow?.smtpHost) throw new Error('邮件服务未配置');
  return {
    host: smtpRow.smtpHost as string,
    port: smtpRow.smtpPort!,
    user: smtpRow.smtpUser || '',
    password: (() => { try { return decrypt(smtpRow.smtpPassword || ''); } catch { return smtpRow.smtpPassword || ''; } })(),
    from: smtpRow.smtpFrom || '',
    secure: smtpRow.smtpSecure ?? false,
  };
}

export async function getAdminListForReset(userId: string) {
  const db = getDb();
  const admins = await db.select({
    id: users.id,
    username: users.username,
    nickname: users.nickname,
  }).from(users).where(
    and(eq(users.role, 'admin'), eq(users.notificationsEnabled, true))
  );
  return admins.filter((a: { id: string }) => a.id !== userId);
}

export async function requestAdminReset(userId: string, adminId: string, alternateEmail: string) {
  const db = getDb();

  const [user] = await db.select({ username: users.username }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error('用户不存在');

  const [admin] = await db.select({
    email: users.email,
    notificationsEnabled: users.notificationsEnabled,
  }).from(users).where(eq(users.id, adminId)).limit(1);
  if (!admin) throw new Error('管理员不存在');
  if (!admin.notificationsEnabled) throw new Error('该管理员未启用通知');

  const smtpConfig = await getSmtpConfig();

  const emailCode = generateEmailCode();

  const requestId = await createResetRequest({
    userId,
    username: user.username,
    adminId,
    adminEmail: admin.email || '',
    alternateEmail,
    emailCode,
  });

  const html = `<div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:20px">
<h2 style="text-align:center;color:#1f2937">DMHub 邮箱验证</h2>
<p style="text-align:center;color:#6b7280">您正在请求管理员帮助重置备用验证码</p>
<p style="text-align:center;color:#6b7280">验证码为：</p>
<div style="text-align:center;font-size:32px;font-weight:bold;letter-spacing:8px;padding:16px;background:#f3f4f6;border-radius:8px;margin:16px 0">${emailCode}</div>
<p style="text-align:center;color:#9ca3af;font-size:14px">验证码在5 分钟内有效，请勿泄露给他人</p>
</div>`;

  const result = await sendMail(smtpConfig, alternateEmail, 'DMHub 邮箱验证', html);
  if (!result.success) throw new Error('验证码发送失败：' + (result.error || ''));

  return { requestId };
}

export async function verifyAdminResetEmail(requestId: string, code: string) {
  const valid = await verifyResetEmail(requestId, code);
  if (!valid) throw new Error('验证码错误或已过期');

  const req = await getResetRequest(requestId);
  if (!req) throw new Error('请求不存在');

  const smtpConfig = await getSmtpConfig();

  const html = `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px">
<h2 style="text-align:center;color:#1f2937">DMHub 备用码重置请求</h2>
<p style="color:#6b7280">用户 <strong>${req.username}</strong> 请求重置两步验证备用码。</p>
<p style="color:#6b7280">该用户已通过备用邮箱验证身份：<strong>${req.alternateEmail}</strong></p>
<p style="color:#6b7280">请登录管理后台审核此请求。</p>
</div>`;

  await sendMail(smtpConfig, req.adminEmail, 'DMHub 备用码重置请求', html);

  await triggerNotification('admin_reset.requested', {
    title: '备用码重置请求',
    content: `用户 ${req.username} 请求重置备用验证码`,
    level: 'warning' as const,
    metadata: { requestId, userId: req.userId, username: req.username },
  });

  return { verified: true };
}

export async function getPendingAdminResetRequests() {
  const list = await getPendingRequests();
  return list.map(req => ({
    requestId: req.requestId,
    userId: req.userId,
    username: req.username,
    alternateEmail: req.alternateEmail,
    createdAt: new Date(req.createdAt).toISOString(),
  }));
}

export async function approveAdminResetRequest(requestId: string) {
  const req = await getResetRequest(requestId);
  if (!req || req.status !== 'pending_admin') throw new Error('请求不存在或无法审批');

  const resetCode = await approveResetRequest(requestId);
  if (!resetCode) throw new Error('审批失败');

  const smtpConfig = await getSmtpConfig();

  const html = `<div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:20px">
<h2 style="text-align:center;color:#1f2937">DMHub 备用码重置</h2>
<p style="text-align:center;color:#6b7280">您的备用码重置请求已被批准</p>
<p style="text-align:center;color:#6b7280">重置码为：</p>
<div style="text-align:center;font-size:24px;font-weight:bold;letter-spacing:4px;padding:16px;background:#f3f4f6;border-radius:8px;margin:16px 0">${resetCode}</div>
<p style="text-align:center;color:#9ca3af;font-size:14px">请回到登录页面输入此重置码完成备用码重置</p>
</div>`;

  await sendMail(smtpConfig, req.alternateEmail, 'DMHub 备用码重置码', html);

  return { approved: true };
}

export async function rejectAdminResetRequest(requestId: string, reason?: string) {
  const req = await getResetRequest(requestId);
  if (!req || req.status !== 'pending_admin') throw new Error('请求不存在或无法拒绝');

  const success = await rejectResetRequest(requestId, reason);
  if (!success) throw new Error('拒绝失败');

  const smtpConfig = await getSmtpConfig();

  const html = `<div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:20px">
<h2 style="text-align:center;color:#1f2937">DMHub 备用码重置</h2>
<p style="text-align:center;color:#6b7280">您的备用码重置请求已被拒绝。</p>
${reason ? `<p style="text-align:center;color:#6b7280">原因：${reason}</p>` : ''}
<p style="text-align:center;color:#9ca3af;font-size:14px">如需帮助，请联系管理员</p>
</div>`;

  await sendMail(smtpConfig, req.alternateEmail, 'DMHub 备用码重置请求被拒绝', html);

  return { rejected: true };
}

export async function applyAdminReset(userId: string, resetCode: string) {
  const req = await validateResetCode(userId, resetCode);
  if (!req) throw new Error('重置码无效或已过期');

  const codes = await regenerateBackupCodes(userId);
  return { backupCodes: codes };
}
