import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { teamSettings, inviteCodes, users, domainAssignments, refreshTokens } from '../db/schema.js';
import { insertReturningOne } from '../db/helpers.js';
import { generateInviteCode } from '../lib/invite-code.js';
import { LOGO_MAX_SIZE_BYTES, LOGO_ALLOWED_TYPES } from '@dmhub/shared';

const BACKGROUND_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const BACKGROUND_ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
import { logOperation } from '../lib/log.js';
import { triggerNotification, notifyAdmins } from './notification.js';
import { encrypt, decrypt } from '../lib/crypto.js';

// SVG 清理（防止 XSS）
let DOMPurify: any = null;
let JSDOM: any = null;
async function sanitizeSvg(data: Buffer): Promise<Buffer> {
  if (!DOMPurify) {
    const dp = await import('dompurify');
    DOMPurify = dp.default || dp;
    const jsdom = await import('jsdom');
    JSDOM = jsdom.JSDOM || jsdom.default;
  }
  const dom = new JSDOM('');
  const purify = DOMPurify(dom.window);
  const svgString = data.toString('utf-8');
  const clean = purify.sanitize(svgString, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ['use'],
    FORBID_TAGS: ['script', 'foreignObject'],
    FORBID_ATTR: ['onload', 'onclick', 'onerror', 'onmouseover'],
  });
  return Buffer.from(clean, 'utf-8');
}

// SMTP 密码加密存储
export function protectConfigValue(value: string): string {
  return encrypt(value);
}

export function revealConfigValue(encrypted: string): string {
  try {
    return decrypt(encrypted);
  } catch {
    return encrypted;
  }
}

export async function getTeamSettings() {
  const db = getDb();
  const [settings] = await db.select({
    id: teamSettings.id,
    name: teamSettings.name,
    description: teamSettings.description,
    logoUrl: teamSettings.logoUrl,
    defaultRole: teamSettings.defaultRole,
    initialized: teamSettings.initialized,
    siteUrl: teamSettings.siteUrl,
    smtpHost: teamSettings.smtpHost,
    smtpPort: teamSettings.smtpPort,
    smtpUser: teamSettings.smtpUser,
    smtpFrom: teamSettings.smtpFrom,
    smtpSecure: teamSettings.smtpSecure,
    inviteCodeEnabled: teamSettings.inviteCodeEnabled,
    registrationEnabled: teamSettings.registrationEnabled,
    announcement: teamSettings.announcement,
    announcementFormat: teamSettings.announcementFormat,
    landingSubtitle: teamSettings.landingSubtitle,
    landingBackgroundUrl: teamSettings.landingBackgroundUrl,
    footerContent: teamSettings.footerContent,
    footerFormat: teamSettings.footerFormat,
    logRetentionDays: teamSettings.logRetentionDays,
    redisUrl: teamSettings.redisUrl,
    createdAt: teamSettings.createdAt,
    updatedAt: teamSettings.updatedAt,
  }).from(teamSettings).where(eq(teamSettings.id, 1));
  return settings ?? null;
}

export async function updateTeamSettings(
  userId: string,
  input: {
    name?: string;
    description?: string;
    siteUrl?: string;
    smtpHost?: string;
    smtpPort?: number;
    smtpUser?: string;
    smtpPassword?: string;
    smtpFrom?: string;
    smtpSecure?: boolean;
    inviteCodeEnabled?: boolean;
    registrationEnabled?: boolean;
    announcement?: string;
    announcementFormat?: string;
    landingSubtitle?: string;
    footerContent?: string;
    footerFormat?: string;
    logRetentionDays?: number | null;
    redisUrl?: string | null;
  },
  ipAddress?: string,
  userAgent?: string,
) {
  const db = getDb();

  const [current] = await db.select().from(teamSettings).where(eq(teamSettings.id, 1));
  if (!current) {
    throw new Error('团队设置不存在');
  }

  const updateData: Record<string, any> = { updatedAt: new Date() };
  if (input.name !== undefined) updateData.name = input.name;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.siteUrl !== undefined) updateData.siteUrl = input.siteUrl;
  if (input.smtpHost !== undefined) updateData.smtpHost = input.smtpHost;
  if (input.smtpPort !== undefined) updateData.smtpPort = input.smtpPort;
  if (input.smtpUser !== undefined) updateData.smtpUser = input.smtpUser;
  if (input.smtpPassword !== undefined) updateData.smtpPassword = protectConfigValue(input.smtpPassword);
  if (input.smtpFrom !== undefined) updateData.smtpFrom = input.smtpFrom;
  if (input.smtpSecure !== undefined) updateData.smtpSecure = input.smtpSecure;
  if (input.inviteCodeEnabled !== undefined) updateData.inviteCodeEnabled = input.inviteCodeEnabled;
  if (input.registrationEnabled !== undefined) updateData.registrationEnabled = input.registrationEnabled;
  if (input.announcement !== undefined) updateData.announcement = input.announcement || null;
  if (input.announcementFormat !== undefined) updateData.announcementFormat = input.announcementFormat;
  if (input.landingSubtitle !== undefined) updateData.landingSubtitle = input.landingSubtitle || null;
  if (input.footerContent !== undefined) updateData.footerContent = input.footerContent || null;
  if (input.footerFormat !== undefined) updateData.footerFormat = input.footerFormat;
  if (input.logRetentionDays !== undefined) updateData.logRetentionDays = input.logRetentionDays;
  if (input.redisUrl !== undefined) updateData.redisUrl = input.redisUrl || null;

  await db.update(teamSettings).set(updateData).where(eq(teamSettings.id, 1));

  const warnings: string[] = [];

  if (input.siteUrl !== undefined && input.siteUrl !== current.siteUrl) {
    warnings.push('站点 URL 已变更，OAuth 回调地址和 Cookie 域名设置可能需要同步更新。');
  }

  const smtpChanged =
    (input.smtpHost !== undefined && input.smtpHost !== current.smtpHost) ||
    (input.smtpPort !== undefined && input.smtpPort !== current.smtpPort) ||
    (input.smtpUser !== undefined && input.smtpUser !== current.smtpUser) ||
    (input.smtpPassword !== undefined) ||
    (input.smtpFrom !== undefined && input.smtpFrom !== current.smtpFrom) ||
    (input.smtpSecure !== undefined && input.smtpSecure !== current.smtpSecure);

  if (smtpChanged) {
    warnings.push('SMTP 配置已变更，建议重新验证邮件发送是否正常。');
  }

  await logOperation({
    userId,
    action: 'team_settings.update',
    targetType: 'team_settings',
    targetId: '1',
    detail: { updatedFields: Object.keys(updateData).filter((k) => k !== 'updatedAt') },
    ipAddress,
    userAgent,
  });

  const criticalChanged = (input.siteUrl !== undefined && input.siteUrl !== current.siteUrl) || smtpChanged;
  if (criticalChanged) {
    const changedFields: string[] = [];
    if (input.siteUrl !== undefined && input.siteUrl !== current.siteUrl) changedFields.push('站点URL');
    if (smtpChanged) changedFields.push('SMTP配置');
    const message = {
      title: '团队关键设置已变更',
      content: `管理员更新了关键设置：${changedFields.join('、')}。${input.siteUrl !== undefined && input.siteUrl !== current.siteUrl ? '请确认 OAuth 回调地址已同步更新，已登录用户可能需要重新登录。' : ''}${smtpChanged ? ' SMTP 配置变更后请重新验证邮件发送。' : ''}`,
      level: 'warning' as const,
      metadata: { changedFields },
    };
    await triggerNotification('team_settings.updated', message);
    await notifyAdmins('team_settings.updated', message);
  }

  const [updated] = await db.select({
    id: teamSettings.id,
    name: teamSettings.name,
    description: teamSettings.description,
    logoUrl: teamSettings.logoUrl,
    defaultRole: teamSettings.defaultRole,
    initialized: teamSettings.initialized,
    siteUrl: teamSettings.siteUrl,
    smtpHost: teamSettings.smtpHost,
    smtpPort: teamSettings.smtpPort,
    smtpUser: teamSettings.smtpUser,
    smtpFrom: teamSettings.smtpFrom,
    smtpSecure: teamSettings.smtpSecure,
    inviteCodeEnabled: teamSettings.inviteCodeEnabled,
    announcement: teamSettings.announcement,
    announcementFormat: teamSettings.announcementFormat,
    landingSubtitle: teamSettings.landingSubtitle,
    landingBackgroundUrl: teamSettings.landingBackgroundUrl,
    footerContent: teamSettings.footerContent,
    footerFormat: teamSettings.footerFormat,
    logRetentionDays: teamSettings.logRetentionDays,
    redisUrl: teamSettings.redisUrl,
    createdAt: teamSettings.createdAt,
    updatedAt: teamSettings.updatedAt,
  }).from(teamSettings).where(eq(teamSettings.id, 1));

  return { settings: updated, warnings };
}

export async function uploadLogo(
  fileData: Buffer,
  _filename: string,
  mimetype: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  if (!LOGO_ALLOWED_TYPES.includes(mimetype as any)) {
    throw new Error('不支持的文件类型，仅支持 PNG、JPG、SVG');
  }

  if (fileData.length > LOGO_MAX_SIZE_BYTES) {
    throw new Error('文件大小超过 1MB 限制');
  }

  // SVG 文件清理 XSS
  let processedData = fileData;
  if (mimetype === 'image/svg+xml') {
    processedData = await sanitizeSvg(fileData);
  }

  const db = getDb();
  const [current] = await db.select({ logoUrl: teamSettings.logoUrl }).from(teamSettings).where(eq(teamSettings.id, 1));

  const ext = mimetype === 'image/svg+xml' ? 'svg' : mimetype === 'image/png' ? 'png' : 'jpg';
  const uuid = crypto.randomUUID();
  const uploadDir = path.join(process.cwd(), 'uploads', 'logo');

  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  if (current?.logoUrl) {
    try {
      const resolvedUploadDir = path.resolve(uploadDir);
      const oldPath = path.resolve(process.cwd(), current.logoUrl.replace(/^\//, ''));
      // 路径遍历防护：严格限制删除目标必须在 uploads/logo 目录内
      if (oldPath.startsWith(resolvedUploadDir) && fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    } catch {}
  }

  const savedName = `${uuid}.${ext}`;
  const savedPath = path.join(uploadDir, savedName);
  fs.writeFileSync(savedPath, processedData);

  const logoUrl = `/uploads/logo/${savedName}`;
  await db.update(teamSettings).set({ logoUrl, updatedAt: new Date() }).where(eq(teamSettings.id, 1));

  await logOperation({
    userId,
    action: 'team_settings.update',
    targetType: 'team_settings',
    targetId: '1',
    detail: { logoUrl },
    ipAddress,
    userAgent,
  });

  return { logoUrl };
}

export async function uploadBackground(
  fileData: Buffer,
  _filename: string,
  mimetype: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  if (!BACKGROUND_ALLOWED_TYPES.includes(mimetype as any)) {
    throw new Error('不支持的文件类型，仅支持 PNG、JPG、WEBP、GIF');
  }

  if (fileData.length > BACKGROUND_MAX_SIZE_BYTES) {
    throw new Error('文件大小超过 5MB 限制');
  }

  const db = getDb();
  const [current] = await db.select({ landingBackgroundUrl: teamSettings.landingBackgroundUrl }).from(teamSettings).where(eq(teamSettings.id, 1));

  const ext = mimetype === 'image/png' ? 'png' : mimetype === 'image/webp' ? 'webp' : mimetype === 'image/gif' ? 'gif' : 'jpg';
  const uuid = crypto.randomUUID();
  const uploadDir = path.join(process.cwd(), 'uploads', 'background');

  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  if (current?.landingBackgroundUrl) {
    try {
      const resolvedUploadDir = path.resolve(uploadDir);
      const oldPath = path.resolve(process.cwd(), current.landingBackgroundUrl.replace(/^\//, ''));
      // 路径遍历防护：严格限制删除目标必须在 uploads/background 目录内
      if (oldPath.startsWith(resolvedUploadDir) && fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    } catch {}
  }

  const savedName = `${uuid}.${ext}`;
  const savedPath = path.join(uploadDir, savedName);
  fs.writeFileSync(savedPath, fileData);

  const landingBackgroundUrl = `/uploads/background/${savedName}`;
  await db.update(teamSettings).set({ landingBackgroundUrl, updatedAt: new Date() }).where(eq(teamSettings.id, 1));

  await logOperation({
    userId,
    action: 'team_settings.update',
    targetType: 'team_settings',
    targetId: '1',
    detail: { landingBackgroundUrl },
    ipAddress,
    userAgent,
  });

  return { landingBackgroundUrl };
}

export async function createInviteCode(
  userId: string,
  maxUses?: number,
  expiresAt?: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const code = generateInviteCode();

  const result = await insertReturningOne(
    inviteCodes,
    {
      code,
      maxUses: maxUses ?? 0,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      createdBy: userId,
    },
    {
      id: inviteCodes.id,
      code: inviteCodes.code,
      maxUses: inviteCodes.maxUses,
      currentUses: inviteCodes.currentUses,
      expiresAt: inviteCodes.expiresAt,
      createdBy: inviteCodes.createdBy,
      createdAt: inviteCodes.createdAt,
    },
  );

  await logOperation({
    userId,
    action: 'member.invite',
    targetType: 'invite_code',
    targetId: result.id,
    detail: { maxUses: maxUses ?? 0, expiresAt: expiresAt ?? null },
    ipAddress,
    userAgent,
  });

  return result;
}

export async function getInviteCodes() {
  const db = getDb();
  const codes = await db.select({
    id: inviteCodes.id,
    code: inviteCodes.code,
    maxUses: inviteCodes.maxUses,
    currentUses: inviteCodes.currentUses,
    expiresAt: inviteCodes.expiresAt,
    createdBy: inviteCodes.createdBy,
    createdAt: inviteCodes.createdAt,
  }).from(inviteCodes);
  return codes;
}

export async function regenerateInviteCodes(userId: string, ipAddress?: string, userAgent?: string) {
  const db = getDb();

  await db.delete(inviteCodes);

  const code = generateInviteCode();
  const result = await insertReturningOne(
    inviteCodes,
    {
      code,
      maxUses: 0,
      createdBy: userId,
    },
    {
      id: inviteCodes.id,
      code: inviteCodes.code,
      maxUses: inviteCodes.maxUses,
      currentUses: inviteCodes.currentUses,
      expiresAt: inviteCodes.expiresAt,
      createdBy: inviteCodes.createdBy,
      createdAt: inviteCodes.createdAt,
    },
  );

  await logOperation({
    userId,
    action: 'member.invite',
    targetType: 'invite_code',
    targetId: result.id,
    detail: { regenerated: true },
    ipAddress,
    userAgent,
  });

  await notifyAdmins('invite_code.regenerated', {
    title: '邀请码已重新生成',
    content: '所有旧邀请码已立即失效。如需让团队成员加入，请分发新邀请码。',
    level: 'warning' as const,
  });

  return result;
}

export async function getMembers() {
  const db = getDb();
  const members = await db.select({
    id: users.id,
    username: users.username,
    email: users.email,
    displayName: users.displayName,
    role: users.role,
    twoFactorEnabled: users.twoFactorEnabled,
    status: users.status,
    createdAt: users.createdAt,
  }).from(users);
  return members;
}

export async function updateMemberRole(
  adminUserId: string,
  targetUserId: string,
  newRole: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const db = getDb();

  const validRoles = ['admin', 'member', 'guest'];
  if (!validRoles.includes(newRole)) {
    throw new Error('无效的角色');
  }

  const [target] = await db.select({
    id: users.id,
    username: users.username,
    role: users.role,
  }).from(users).where(eq(users.id, targetUserId)).limit(1);

  if (!target) {
    throw new Error('用户不存在');
  }

  if (target.role === 'admin' && newRole !== 'admin') {
    const adminCount = await db.select({ id: users.id })
      .from(users)
      .where(eq(users.role, 'admin'));
    if (adminCount.length <= 1) {
      throw new Error('不能降级最后一个管理员');
    }
  }

  await db.update(users).set({ role: newRole, updatedAt: new Date() }).where(eq(users.id, targetUserId));

  await logOperation({
    userId: adminUserId,
    action: 'member.role_change',
    targetType: 'user',
    targetId: targetUserId,
    detail: { from: target.role, to: newRole, username: target.username },
    ipAddress,
    userAgent,
  });

  await triggerNotification('member.role_changed', {
    title: '成员角色变更',
    content: `${target.username} 的角色从 ${target.role} 变更为 ${newRole}`,
    level: 'warning' as const,
  });
  await notifyAdmins('member.role_changed', {
    title: '成员角色变更',
    content: `管理员将 ${target.username} 的角色从 ${target.role} 变更为 ${newRole}，权限范围已立即生效。`,
    level: 'warning' as const,
    metadata: { targetUserId, from: target.role, to: newRole },
  });

  return {
    warning: '角色变更已立即生效，该用户的权限已随之调整。',
  };
}

export async function removeMember(
  adminUserId: string,
  targetUserId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const db = getDb();

  const [target] = await db.select({
    id: users.id,
    username: users.username,
    role: users.role,
  }).from(users).where(eq(users.id, targetUserId)).limit(1);

  if (!target) {
    throw new Error('用户不存在');
  }

  if (target.role === 'admin') {
    const adminCount = await db.select({ id: users.id })
      .from(users)
      .where(eq(users.role, 'admin'));
    if (adminCount.length <= 1) {
      throw new Error('不能删除最后一个管理员');
    }
  }

  await db.delete(domainAssignments).where(eq(domainAssignments.userId, targetUserId));
  await db.delete(refreshTokens).where(eq(refreshTokens.userId, targetUserId));
  await db.delete(users).where(eq(users.id, targetUserId));

  await logOperation({
    userId: adminUserId,
    action: 'member.remove',
    targetType: 'user',
    targetId: targetUserId,
    detail: { username: target.username, role: target.role },
    ipAddress,
    userAgent,
  });

  await triggerNotification('member.removed', {
    title: '成员被移除',
    content: `${target.username} (${target.role}) 已被移出团队`,
    level: 'warning' as const,
  });
  await notifyAdmins('member.removed', {
    title: '成员被移除',
    content: `管理员已将 ${target.username}（原角色 ${target.role}）移出团队。`,
    level: 'warning' as const,
    metadata: { targetUserId, role: target.role },
  });

  await db.delete(users).where(eq(users.id, targetUserId));
}

export async function updateMemberStatus(
  adminUserId: string,
  targetUserId: string,
  newStatus: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const db = getDb();

  if (!['active', 'disabled'].includes(newStatus)) {
    throw new Error('无效的状态，必须是 active 或 disabled');
  }

  const [target] = await db.select({
    id: users.id,
    username: users.username,
    role: users.role,
    status: users.status,
  }).from(users).where(eq(users.id, targetUserId)).limit(1);

  if (!target) {
    throw new Error('用户不存在');
  }

  if (target.role === 'admin' && newStatus === 'disabled') {
    const adminCount = await db.select({ id: users.id })
      .from(users)
      .where(eq(users.role, 'admin'));
    if (adminCount.length <= 1) {
      throw new Error('不能禁用最后一个管理员');
    }
  }

  await db.update(users).set({ status: newStatus, updatedAt: new Date() }).where(eq(users.id, targetUserId));

  if (newStatus === 'disabled') {
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, targetUserId));
  }

  await logOperation({
    userId: adminUserId,
    action: 'member.status_change',
    targetType: 'user',
    targetId: targetUserId,
    detail: { from: target.status, to: newStatus, username: target.username },
    ipAddress,
    userAgent,
  });

  await triggerNotification('member.status_changed', {
    title: newStatus === 'disabled' ? '成员账号已禁用' : '成员账号已启用',
    content: `${target.username} 的账号状态已变更为${newStatus === 'disabled' ? '禁用' : '启用'}`,
    level: 'warning' as const,
  });

  return { success: true };
}
