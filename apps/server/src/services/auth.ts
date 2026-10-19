import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { eq, or, sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { users, inviteCodes, refreshTokens, teamSettings, userTokens } from '../db/schema.js';
import { insertReturningOne } from '../db/helpers.js';
import { signAccessToken, signRefreshToken, sign2FAToken, verifyToken } from '../lib/jwt.js';
import { RefreshTokenRejectedError } from '../lib/refresh-token.js';
import type { RegisterInput } from '@dmhub/shared';
import { logOperation } from '../lib/log.js';
import { decrypt } from '../lib/crypto.js';
import { generateEmailCode, storeEmailCode, verifyEmailCodeEntry, getEmailCodePendingEmail, type EmailCodePurpose } from '../lib/email-code-store.js';
import { sendMail } from '../lib/smtp.js';

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function storeRefreshToken(userId: string, rawToken: string, deviceInfo?: string) {
  const db = getDb();
  const tokenHash = hashToken(rawToken);
  await db.insert(refreshTokens).values({
    userId,
    tokenHash,
    deviceInfo: deviceInfo ? deviceInfo.slice(0, 255) : null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
}

export async function register(input: RegisterInput, deviceInfo?: string) {
  const db = getDb();

  const [settings] = await db.select({ inviteCodeEnabled: teamSettings.inviteCodeEnabled, registrationEnabled: teamSettings.registrationEnabled }).from(teamSettings).where(eq(teamSettings.id, 1));
  const inviteCodeEnabled = settings?.inviteCodeEnabled ?? true;
  const registrationEnabled = settings?.registrationEnabled ?? true;

  if (!registrationEnabled) {
    throw new Error('注册已关闭');
  }

  if (inviteCodeEnabled) {
    if (!input.inviteCode) {
      throw new Error('邀请码不能为空');
    }

    const [invite] = await db.select().from(inviteCodes).where(eq(inviteCodes.code, input.inviteCode)).limit(1);
    if (!invite) {
      throw new Error('邀请码不存在');
    }
    if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
      throw new Error('邀请码已过期');
    }
    if (invite.maxUses > 0 && invite.currentUses >= invite.maxUses) {
      throw new Error('邀请码已达到使用上限');
    }
  }

  const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.username, input.username)).limit(1);
  if (existingUser) {
    throw new Error('用户名或邮箱已被使用');
  }

  // registerSchema 已要求邮箱必填，这里直接使用
  const emailValue = input.email;
  if (emailValue) {
    const [existingEmail] = await db.select({ id: users.id }).from(users).where(eq(users.email, emailValue)).limit(1);
    if (existingEmail) {
      throw new Error('用户名或邮箱已被使用');
    }
  }

  const passwordHash = await bcrypt.hash(input.password, 12);

  const user = await insertReturningOne<{ id: string; username: string; email: string | null; role: string }>(
    users,
    {
      username: input.username,
      email: emailValue,
      passwordHash,
      role: 'member',
      emailVerified: false,
    },
    {
      id: users.id,
      username: users.username,
      email: users.email,
      role: users.role,
    },
  );

  if (inviteCodeEnabled && input.inviteCode) {
    await db.update(inviteCodes)
      .set({ currentUses: sql`${inviteCodes.currentUses} + 1` })
      .where(eq(inviteCodes.code, input.inviteCode));
  }

  const accessToken = signAccessToken(user.id, user.role);
  const refreshToken = signRefreshToken(user.id);

  await storeRefreshToken(user.id, refreshToken, deviceInfo);

  return { user, accessToken, refreshToken };
}

export async function login(username: string, password: string, deviceInfo?: string, ipAddress?: string, userAgent?: string) {
  const db = getDb();

  const [user] = await db.select({
    id: users.id,
    username: users.username,
    email: users.email,
    passwordHash: users.passwordHash,
    role: users.role,
    twoFactorEnabled: users.twoFactorEnabled,
    status: users.status,
  }).from(users).where(
    or(eq(users.username, username), eq(users.email, username))
  ).limit(1);

  if (!user || !user.passwordHash) {
    // 时序攻击防护：即使用户不存在也执行一次 bcrypt 比较
    await bcrypt.compare(password, '$2a$12$dummyHashToPreventTimingAttackxxxxxxxxxxxxxxxxxxxxxx');
    throw new Error('用户名或密码错误');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new Error('用户名或密码错误');
  }

  if (user.status === 'disabled') {
    throw new Error('账号已被禁用');
  }

  if (user.twoFactorEnabled) {
    const tempToken = sign2FAToken(user.id);
    return { requires2FA: true as const, tempToken };
  }

  await logOperation({
    userId: user.id,
    action: 'login',
    targetType: 'user',
    targetId: user.id,
    detail: { username: user.username },
    ipAddress,
    userAgent,
  });

  const accessToken = signAccessToken(user.id, user.role);
  const refreshToken = signRefreshToken(user.id);

  await storeRefreshToken(user.id, refreshToken, deviceInfo);

  return {
    requires2FA: false as const,
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    },
  };
}

export async function refreshAuth(oldRefreshToken: string, deviceInfo?: string) {
  const db = getDb();

  let payload: { userId: string };
  try {
    payload = verifyToken(oldRefreshToken) as { userId: string };
  } catch {
    throw new RefreshTokenRejectedError(false, '刷新令牌无效或已过期');
  }

  if ('scope' in payload && (payload as any).scope === '2fa') {
    throw new RefreshTokenRejectedError(false, '无效的刷新令牌');
  }

  const tokenHash = hashToken(oldRefreshToken);

  const [storedToken] = await db.select().from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .limit(1);

  if (!storedToken) {
    // 库中查不到：可能是刚被另一个请求轮换掉（多标签页竞态），客户端重试即可
    throw new RefreshTokenRejectedError(true, '刷新令牌已被使用');
  }

  if (new Date(storedToken.expiresAt) < new Date()) {
    await db.delete(refreshTokens).where(eq(refreshTokens.id, storedToken.id));
    throw new RefreshTokenRejectedError(false, '刷新令牌已过期');
  }

  // 原子删除：通过 returning() 检测删除行数，防止竞态条件
  const deleted = await db.delete(refreshTokens)
    .where(eq(refreshTokens.id, storedToken.id))
    .returning({ id: refreshTokens.id });

  if (deleted.length === 0) {
    // 令牌已被其他请求消费
    throw new RefreshTokenRejectedError(true, '刷新令牌已被使用');
  }

  const [user] = await db.select({ id: users.id, role: users.role })
    .from(users).where(eq(users.id, storedToken.userId)).limit(1);

  if (!user) {
    throw new Error('用户不存在');
  }

  const accessToken = signAccessToken(user.id, user.role);
  const newRefreshToken = signRefreshToken(user.id);

  await storeRefreshToken(user.id, newRefreshToken, deviceInfo);

  return { accessToken, refreshToken: newRefreshToken };
}

export async function logout(rawToken: string) {
  const db = getDb();
  try {
    verifyToken(rawToken);
  } catch {
    return;
  }
  const tokenHash = hashToken(rawToken);
  await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash));
}

export async function getUserById(userId: string) {
  const db = getDb();
  const [user] = await db.select({
    id: users.id,
    username: users.username,
    email: users.email,
    displayName: users.displayName,
    nickname: users.nickname,
    avatarUrl: users.avatarUrl,
    role: users.role,
    twoFactorEnabled: users.twoFactorEnabled,
    twoFactorMethods: users.twoFactorMethods,
    emailVerified: users.emailVerified,
    notificationsEnabled: users.notificationsEnabled,
    emailNotificationsEnabled: users.emailNotificationsEnabled,
    status: users.status,
    createdAt: users.createdAt,
    updatedAt: users.updatedAt,
  }).from(users).where(eq(users.id, userId)).limit(1);
  return user ?? null;
}

export async function changePassword(userId: string, oldPassword: string, newPassword: string) {
  const db = getDb();

  const [user] = await db.select({
    id: users.id,
    passwordHash: users.passwordHash,
  }).from(users).where(eq(users.id, userId)).limit(1);

  if (!user || !user.passwordHash) {
    throw new Error('用户不存在');
  }

  const valid = await bcrypt.compare(oldPassword, user.passwordHash);
  if (!valid) {
    throw new Error('当前密码不正确');
  }

  if (newPassword.length < 8) {
    throw new Error('新密码至少8个字符');
  }

  const newHash = await bcrypt.hash(newPassword, 12);
  await db.update(users).set({ passwordHash: newHash, updatedAt: new Date() }).where(eq(users.id, userId));

  await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
}

export async function updateProfile(userId: string, input: {
  displayName?: string;
  nickname?: string;
  avatarUrl?: string;
  notificationsEnabled?: boolean;
  emailNotificationsEnabled?: boolean;
}) {
  const db = getDb();

  const updateData: Record<string, any> = { updatedAt: new Date() };
  if (input.displayName !== undefined) updateData.displayName = input.displayName || null;
  if (input.nickname !== undefined) updateData.nickname = input.nickname || null;
  if (input.avatarUrl !== undefined) updateData.avatarUrl = input.avatarUrl || null;
  if (input.notificationsEnabled !== undefined) updateData.notificationsEnabled = input.notificationsEnabled;
  if (input.emailNotificationsEnabled !== undefined) {
    updateData.emailNotificationsEnabled = input.emailNotificationsEnabled;
  }

  await db.update(users).set(updateData).where(eq(users.id, userId));

  const [updated] = await db.select({
    id: users.id,
    username: users.username,
    email: users.email,
    displayName: users.displayName,
    nickname: users.nickname,
    avatarUrl: users.avatarUrl,
    role: users.role,
    twoFactorEnabled: users.twoFactorEnabled,
    twoFactorMethods: users.twoFactorMethods,
    emailVerified: users.emailVerified,
    notificationsEnabled: users.notificationsEnabled,
    emailNotificationsEnabled: users.emailNotificationsEnabled,
    status: users.status,
    createdAt: users.createdAt,
    updatedAt: users.updatedAt,
  }).from(users).where(eq(users.id, userId)).limit(1);

  return updated;
}

export async function changeEmail(userId: string, newEmail: string, password: string) {
  const db = getDb();

  const [user] = await db.select({
    id: users.id,
    passwordHash: users.passwordHash,
  }).from(users).where(eq(users.id, userId)).limit(1);

  if (!user || !user.passwordHash) {
    throw new Error('用户不存在');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new Error('密码不正确');
  }

  const emailValue = newEmail?.trim();
  if (!emailValue) {
    throw new Error('邮箱不能为空');
  }
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, emailValue)).limit(1);
  if (existing && existing.id !== userId) {
    throw new Error('邮箱已被其他用户使用');
  }

  await db.update(users).set({ email: emailValue, emailVerified: false, updatedAt: new Date() }).where(eq(users.id, userId));

  const [updated] = await db.select({
    id: users.id,
    username: users.username,
    email: users.email,
    displayName: users.displayName,
    nickname: users.nickname,
    avatarUrl: users.avatarUrl,
    role: users.role,
    twoFactorEnabled: users.twoFactorEnabled,
    twoFactorMethods: users.twoFactorMethods,
    emailVerified: users.emailVerified,
    status: users.status,
    createdAt: users.createdAt,
    updatedAt: users.updatedAt,
  }).from(users).where(eq(users.id, userId)).limit(1);

  return updated;
}

export async function generateUserToken(userId: string, name: string, permissions: string[]) {
  const db = getDb();

  const rawToken = `dmhub_pt_${crypto.randomBytes(32).toString('hex')}`;
  const tokenPrefix = rawToken.substring(0, 12);
  const tokenHash = await bcrypt.hash(rawToken, 10);

  await db.insert(userTokens).values({
    name,
    tokenHash,
    tokenPrefix,
    permissions,
    userId,
  });

  return { token: rawToken, name, permissions };
}

export async function listUserTokens(userId: string) {
  const db = getDb();
  const rows = await db.select({
    id: userTokens.id,
    name: userTokens.name,
    tokenPrefix: userTokens.tokenPrefix,
    permissions: userTokens.permissions,
    lastUsedAt: userTokens.lastUsedAt,
    createdAt: userTokens.createdAt,
  }).from(userTokens).where(eq(userTokens.userId, userId));
  return rows;
}

export async function revokeUserToken(userId: string, tokenId: string) {
  const db = getDb();
  const [existing] = await db.select({ id: userTokens.id, userId: userTokens.userId })
    .from(userTokens).where(eq(userTokens.id, tokenId)).limit(1);

  if (!existing || existing.userId !== userId) {
    throw new Error('令牌不存在');
  }

  await db.delete(userTokens).where(eq(userTokens.id, tokenId));
  return { success: true };
}

export async function verifyUserToken(rawToken: string) {
  if (!rawToken.startsWith('dmhub_pt_')) {
    return { valid: false };
  }

  const tokenPrefix = rawToken.substring(0, 12);
  const db = getDb();

  const candidates = await db.select({
    id: userTokens.id,
    tokenHash: userTokens.tokenHash,
    permissions: userTokens.permissions,
    userId: userTokens.userId,
    expiresAt: userTokens.expiresAt,
  }).from(userTokens).where(eq(userTokens.tokenPrefix, tokenPrefix));

  for (const candidate of candidates) {
    if (candidate.expiresAt && new Date() > candidate.expiresAt) {
      continue;
    }
    const match = await bcrypt.compare(rawToken, candidate.tokenHash);
    if (match) {
      await db.update(userTokens).set({ lastUsedAt: new Date() }).where(eq(userTokens.id, candidate.id));
      const [user] = await db.select({ id: users.id, role: users.role, status: users.status })
        .from(users).where(eq(users.id, candidate.userId)).limit(1);
      if (!user || user.status === 'disabled') {
        return { valid: false };
      }
      return {
        valid: true,
        tokenId: candidate.id,
        permissions: candidate.permissions,
        userId: candidate.userId,
        userRole: user.role,
      };
    }
  }

  return { valid: false };
}

/**
 * 发送邮箱验证码：
 * - 传入 newEmail + password：向新邮箱发送验证码，用于换绑/首次绑定（需密码确认身份）
 * - 不传 newEmail：向当前邮箱发送验证码，用于验证尚未验证的邮箱
 */
export async function sendEmailChangeCode(
  userId: string,
  newEmail: string | undefined,
  password: string | undefined,
): Promise<{ sentTo: string }> {
  const db = getDb();

  const [user] = await db.select({
    id: users.id,
    email: users.email,
    emailVerified: users.emailVerified,
    passwordHash: users.passwordHash,
  }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error('用户不存在');

  let targetEmail: string;
  let purpose: EmailCodePurpose;
  if (newEmail && newEmail.trim() !== '') {
    if (!password) throw new Error('请输入密码以确认身份');
    const valid = await bcrypt.compare(password, user.passwordHash || '');
    if (!valid) throw new Error('密码不正确');

    targetEmail = newEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      throw new Error('邮箱格式不正确');
    }
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, targetEmail)).limit(1);
    if (existing && existing.id !== userId) {
      throw new Error('邮箱已被其他用户使用');
    }
    purpose = 'email-change';
  } else {
    if (!user.email) throw new Error('请先填写邮箱');
    if (user.emailVerified) throw new Error('邮箱已验证，无需重复验证');
    targetEmail = user.email;
    purpose = 'email-verify';
  }

  const [smtpRow] = await db.select({
    smtpHost: teamSettings.smtpHost,
    smtpPort: teamSettings.smtpPort,
    smtpUser: teamSettings.smtpUser,
    smtpPassword: teamSettings.smtpPassword,
    smtpFrom: teamSettings.smtpFrom,
    smtpSecure: teamSettings.smtpSecure,
  }).from(teamSettings).where(eq(teamSettings.id, 1));
  if (!smtpRow?.smtpHost) throw new Error('邮件服务未配置，请联系管理员');

  const code = generateEmailCode();
  const result = await storeEmailCode(userId, code, purpose, purpose === 'email-change' ? targetEmail : undefined);
  if (!result.success) throw new Error(result.error!);

  const html = `<div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:20px">
<h2 style="text-align:center;color:#1f2937">DMHub 邮箱验证</h2>
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
  }, targetEmail, 'DMHub 邮箱验证码', html);
  if (!smtpResult.success) throw new Error('验证码发送失败：' + (smtpResult.error || ''));

  return { sentTo: targetEmail };
}

/**
 * 校验邮箱验证码。
 * - 指定 scope 时严格按指定用途校验：资料页「验证当前邮箱」用 email-verify，
 *   强制绑定弹窗用 email-change，避免两边验证码并存时互相消耗错误次数。
 * - 未指定 scope 时沿用旧行为：优先换绑（email-change），否则验证当前邮箱（email-verify）。
 */
export async function confirmEmailChange(userId: string, code: string, scope?: 'email-change' | 'email-verify') {
  const db = getDb();

  const pendingEmail = await getEmailCodePendingEmail(userId, 'email-change');
  const purpose: EmailCodePurpose = scope ?? (pendingEmail ? 'email-change' : 'email-verify');
  if (purpose === 'email-change' && !pendingEmail) {
    throw new Error('验证码错误或已过期');
  }

  const valid = await verifyEmailCodeEntry(userId, code, purpose);
  if (!valid) {
    throw new Error('验证码错误或已过期');
  }

  if (purpose === 'email-change' && pendingEmail) {
    // 等待验证期间邮箱可能被他人占用，提交前再查一次
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, pendingEmail)).limit(1);
    if (existing && existing.id !== userId) {
      throw new Error('邮箱已被其他用户使用');
    }
    await db.update(users).set({ email: pendingEmail, emailVerified: true, updatedAt: new Date() }).where(eq(users.id, userId));
  } else {
    const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user?.email) throw new Error('请先填写邮箱');
    await db.update(users).set({ emailVerified: true, updatedAt: new Date() }).where(eq(users.id, userId));
  }

  const [updated] = await db.select({
    id: users.id,
    username: users.username,
    email: users.email,
    displayName: users.displayName,
    nickname: users.nickname,
    avatarUrl: users.avatarUrl,
    role: users.role,
    twoFactorEnabled: users.twoFactorEnabled,
    twoFactorMethods: users.twoFactorMethods,
    emailVerified: users.emailVerified,
    status: users.status,
    notificationsEnabled: users.notificationsEnabled,
    emailNotificationsEnabled: users.emailNotificationsEnabled,
    createdAt: users.createdAt,
    updatedAt: users.updatedAt,
  }).from(users).where(eq(users.id, userId)).limit(1);

  return updated;
}
