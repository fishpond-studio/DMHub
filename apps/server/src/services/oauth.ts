import { eq, and, sql } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { getDb } from '../db/index.js';
import { users, userOauthBindings, oauthProviders, inviteCodes, teamSettings } from '../db/schema.js';
import { insertReturningOne } from '../db/helpers.js';
import { signAccessToken, signRefreshToken } from '../lib/jwt.js';
import { storeRefreshToken } from './auth.js';
import {
  getProvider,
  type OAuthProviderConfig,
  type OAuthUserInfo,
  type OAuthProvider,
} from '../lib/oauth/providers/index.js';
import { generateState, verifyState, type OAuthIntent } from '../lib/oauth/crypto.js';
import { decrypt } from '../lib/crypto.js';
import { logOperation } from '../lib/log.js';
import { config } from '../config/index.js';
import { resolveSiteBaseUrl, buildOAuthCallbackUrl, buildFrontendUrl } from '../lib/oauth/site-url.js';
import { createLoginTicket, consumeLoginTicket } from '../lib/oauth/ticket.js';

interface OAuthPendingToken {
  providerId: string;
  providerUserId: string;
  email?: string;
  name?: string;
  avatar?: string;
  raw?: Record<string, unknown>;
  scope: 'oauth_pending';
}

function signOAuthPendingToken(info: OAuthUserInfo): string {
  const payload: OAuthPendingToken = {
    providerId: info.providerId,
    providerUserId: info.providerUserId,
    email: info.email,
    name: info.name,
    avatar: info.avatar,
    raw: info.raw,
    scope: 'oauth_pending',
  };
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn: '10m' });
}

function verifyOAuthPendingToken(token: string): OAuthPendingToken {
  const payload = jwt.verify(token, config.JWT_SECRET) as OAuthPendingToken;
  if (payload.scope !== 'oauth_pending') {
    throw new Error('Invalid token scope');
  }
  return payload;
}

async function loadProviderConfig(providerId: string): Promise<{
  provider: OAuthProvider;
  providerConfig: OAuthProviderConfig;
}> {
  const provider = getProvider(providerId);
  if (!provider) {
    throw new Error('不支持的 OAuth/OIDC 提供商: ' + providerId);
  }

  const db = getDb();
  const [dbConfig] = await db
    .select()
    .from(oauthProviders)
    .where(and(eq(oauthProviders.providerId, providerId), eq(oauthProviders.enabled, true)))
    .limit(1);

  if (!dbConfig) {
    throw new Error('该提供商未配置或未启用: ' + providerId);
  }

  let clientSecret: string;
  try {
    clientSecret = decrypt(dbConfig.clientSecret);
  } catch {
    clientSecret = dbConfig.clientSecret;
  }

  const isOidc = providerId === 'oidc' || providerId === 'custom';

  let providerConfig: OAuthProviderConfig = {
    clientId: dbConfig.clientId,
    clientSecret,
    scope: dbConfig.scope || provider.defaultScope || undefined,
    // 可选端点覆盖
    authorizeUrl: dbConfig.customAuthorizeUrl || undefined,
    tokenUrl: dbConfig.customTokenUrl || undefined,
    userInfoUrl: dbConfig.customUserInfoUrl || undefined,
    // Well-Known（优先）；兼容旧数据把 customAuthorizeUrl 当 issuer
    wellKnownUrl: (dbConfig as { wellKnownUrl?: string | null }).wellKnownUrl || undefined,
    issuer:
      isOidc && !(dbConfig as { wellKnownUrl?: string | null }).wellKnownUrl
        ? dbConfig.customAuthorizeUrl || undefined
        : undefined,
  };

  // OIDC：预解析 Well-Known / 端点
  if (typeof provider.prepareConfig === 'function') {
    providerConfig = await provider.prepareConfig(providerConfig);
  }

  return { provider, providerConfig };
}

export async function listEnabledProviders() {
  const db = getDb();
  const result = await db
    .select({ providerId: oauthProviders.providerId })
    .from(oauthProviders)
    .where(eq(oauthProviders.enabled, true));

  return result.map((p: { providerId: string }) => {
    const provider = getProvider(p.providerId);
    return {
      providerId: p.providerId,
      name: provider?.name || p.providerId,
      type: provider?.type || 'oauth2',
    };
  });
}

export async function getOAuthCallbackHint(providerId: string, requestOrigin?: string) {
  const siteBase = await resolveSiteBaseUrl(requestOrigin);
  return {
    /** 主页 URL（登记到 IdP） */
    homepageUrl: siteBase,
    siteUrl: siteBase,
    /** 重定向 / 回调 URL（登记到 IdP） */
    redirectUrl: buildOAuthCallbackUrl(siteBase, providerId),
    callbackUrl: buildOAuthCallbackUrl(siteBase, providerId),
  };
}

/**
 * 构造跳转 IdP 的授权 URL。
 * intent=login 公开；intent=bind 必须带 userId。
 */
export async function buildAuthorizationUrl(options: {
  providerId: string;
  intent: OAuthIntent;
  userId?: string;
  requestOrigin?: string;
}): Promise<{ url: string; callbackUrl: string }> {
  const { providerId, intent, userId, requestOrigin } = options;

  if (intent === 'bind' && !userId) {
    throw new Error('绑定账号需要先登录');
  }

  const siteBase = await resolveSiteBaseUrl(requestOrigin);
  const redirectUri = buildOAuthCallbackUrl(siteBase, providerId);

  const { provider, providerConfig } = await loadProviderConfig(providerId);

  const state = generateState({
    providerId,
    redirectUri,
    intent,
    userId,
  });

  const url = provider.getAuthorizationUrl(providerConfig, state, redirectUri);
  return { url, callbackUrl: redirectUri };
}

async function issueSession(user: {
  id: string;
  username: string | null;
  email: string | null;
  role: string;
}, deviceInfo?: string) {
  const accessToken = signAccessToken(user.id, user.role);
  const refreshToken = signRefreshToken(user.id);
  await storeRefreshToken(user.id, refreshToken, deviceInfo);
  return {
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

export async function handleOAuthCallback(
  providerId: string,
  code: string,
  stateRaw: string,
  deviceInfo?: string,
) {
  let state;
  try {
    state = verifyState(stateRaw);
  } catch (err: any) {
    throw new Error(err?.message === 'OAuth state expired' ? '授权已过期，请重新登录' : 'OAuth state 无效，请重新发起登录');
  }

  if (state.providerId !== providerId) {
    throw new Error('OAuth state 与提供商不匹配');
  }

  const redirectUri = state.redirectUri;
  if (!redirectUri) {
    throw new Error('OAuth state 缺少 redirect_uri');
  }

  const { provider, providerConfig } = await loadProviderConfig(providerId);
  const userInfo = await provider.handleCallback(providerConfig, code, redirectUri);

  // —— 绑定流程 ——
  if (state.intent === 'bind') {
    if (!state.userId) {
      throw new Error('绑定会话无效，请重新从账号绑定页发起');
    }
    await bindOAuthIdentity(state.userId, userInfo);
    return {
      type: 'bound' as const,
      providerId: userInfo.providerId,
    };
  }

  // —— 登录流程 ——
  const db = getDb();

  const [existingBinding] = await db
    .select()
    .from(userOauthBindings)
    .where(
      and(
        eq(userOauthBindings.providerId, userInfo.providerId),
        eq(userOauthBindings.providerUserId, userInfo.providerUserId),
      ),
    )
    .limit(1);

  if (existingBinding) {
    const [user] = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
        status: users.status,
      })
      .from(users)
      .where(eq(users.id, existingBinding.userId))
      .limit(1);

    if (!user) throw new Error('关联用户不存在');
    if (user.status === 'disabled') throw new Error('账号已被禁用');

    await db
      .update(userOauthBindings)
      .set({
        providerEmail: userInfo.email || null,
        providerName: userInfo.name || null,
        providerAvatar: userInfo.avatar || null,
        rawData: userInfo.raw || null,
        updatedAt: new Date(),
      })
      .where(eq(userOauthBindings.id, existingBinding.id));

    await logOperation({
      userId: user.id,
      action: 'oauth_login',
      targetType: 'user',
      targetId: user.id,
      detail: { providerId: userInfo.providerId, providerUserId: userInfo.providerUserId },
    });

    const session = await issueSession(user, deviceInfo);
    const ticket = await createLoginTicket(session);
    return { type: 'login' as const, ticket };
  }

  // 新用户
  const userCount = await db.select({ count: sql<number>`count(*)` }).from(users);
  const hasUsers = Number(userCount[0]?.count ?? 0) > 0;

  const [settings] = await db
    .select({
      initialized: teamSettings.initialized,
      inviteCodeEnabled: teamSettings.inviteCodeEnabled,
      registrationEnabled: teamSettings.registrationEnabled,
    })
    .from(teamSettings)
    .where(eq(teamSettings.id, 1));

  // 首个用户 → 管理员
  if (!hasUsers && !settings?.initialized) {
    const newUser = await createUserFromOAuth(userInfo, 'admin');
    await attachBinding(newUser.id, userInfo);

    const [existingTeam] = await db.select().from(teamSettings).limit(1);
    if (!existingTeam) {
      await db.insert(teamSettings).values({ initialized: true });
    } else if (!existingTeam.initialized) {
      await db.update(teamSettings).set({ initialized: true }).where(eq(teamSettings.id, existingTeam.id));
    }

    await logOperation({
      userId: newUser.id,
      action: 'oauth_auto_admin',
      targetType: 'user',
      targetId: newUser.id,
      detail: { providerId: userInfo.providerId, providerUserId: userInfo.providerUserId },
    });

    const session = await issueSession(newUser, deviceInfo);
    return { type: 'login' as const, ticket: await createLoginTicket(session) };
  }

  const inviteCodeEnabled = settings?.inviteCodeEnabled ?? true;
  const registrationEnabled = settings?.registrationEnabled ?? true;

  if (!registrationEnabled) {
    throw new Error('系统已关闭注册，请联系管理员为您创建账号或绑定已有账号');
  }

  // 关闭邀请码 → 直接注册
  if (!inviteCodeEnabled) {
    const newUser = await createUserFromOAuth(userInfo, 'member');
    await attachBinding(newUser.id, userInfo);
    await logOperation({
      userId: newUser.id,
      action: 'oauth_register',
      targetType: 'user',
      targetId: newUser.id,
      detail: { providerId: userInfo.providerId, providerUserId: userInfo.providerUserId, auto: true },
    });
    const session = await issueSession(newUser, deviceInfo);
    return { type: 'login' as const, ticket: await createLoginTicket(session) };
  }

  // 需要邀请码
  return {
    type: 'needs_invite' as const,
    pendingToken: signOAuthPendingToken(userInfo),
    providerId: userInfo.providerId,
    email: userInfo.email,
    name: userInfo.name,
    avatar: userInfo.avatar,
  };
}

async function createUserFromOAuth(userInfo: OAuthUserInfo, role: 'admin' | 'member') {
  const base =
    role === 'admin'
      ? `admin_${userInfo.providerUserId.slice(0, 8)}`
      : `${userInfo.providerId}_${userInfo.providerUserId.slice(0, 8)}`;

  // 用户名冲突时追加随机后缀
  let username = base.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 56);
  const db = getDb();
  const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
  if (exists) {
    username = `${username}_${Math.random().toString(36).slice(2, 6)}`;
  }

  // email 唯一冲突时置空
  let email = userInfo.email || null;
  if (email) {
    const [emailUsed] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (emailUsed) email = null;
  }

  return insertReturningOne<{ id: string; username: string; email: string | null; role: string }>(
    users,
    {
      username,
      email,
      displayName: userInfo.name || null,
      avatarUrl: userInfo.avatar || null,
      role,
      status: 'active',
      emailVerified: !!userInfo.email && email === userInfo.email,
    },
    {
      id: users.id,
      username: users.username,
      email: users.email,
      role: users.role,
    },
  );
}

async function attachBinding(userId: string, userInfo: OAuthUserInfo) {
  const db = getDb();
  await db.insert(userOauthBindings).values({
    userId,
    providerId: userInfo.providerId,
    providerUserId: userInfo.providerUserId,
    providerEmail: userInfo.email || null,
    providerName: userInfo.name || null,
    providerAvatar: userInfo.avatar || null,
    rawData: userInfo.raw || null,
  });
}

async function bindOAuthIdentity(userId: string, userInfo: OAuthUserInfo) {
  const db = getDb();

  const [existingBinding] = await db
    .select()
    .from(userOauthBindings)
    .where(
      and(
        eq(userOauthBindings.providerId, userInfo.providerId),
        eq(userOauthBindings.providerUserId, userInfo.providerUserId),
      ),
    )
    .limit(1);

  if (existingBinding) {
    if (existingBinding.userId === userId) {
      throw new Error('您已绑定该 OAuth 账号');
    }
    throw new Error('该 OAuth 账号已被其他用户绑定');
  }

  const [already] = await db
    .select({ id: userOauthBindings.id })
    .from(userOauthBindings)
    .where(
      and(eq(userOauthBindings.userId, userId), eq(userOauthBindings.providerId, userInfo.providerId)),
    )
    .limit(1);

  if (already) {
    throw new Error('您已绑定过该提供商，请先解绑再重新绑定');
  }

  await attachBinding(userId, userInfo);

  await logOperation({
    userId,
    action: 'oauth_bind',
    targetType: 'user',
    targetId: userId,
    detail: { providerId: userInfo.providerId, providerUserId: userInfo.providerUserId },
  });
}

export async function registerWithOAuth(pendingToken: string, inviteCode: string, deviceInfo?: string) {
  let pendingInfo: OAuthPendingToken;
  try {
    pendingInfo = verifyOAuthPendingToken(pendingToken);
  } catch {
    throw new Error('OAuth 令牌无效或已过期，请重新登录');
  }

  if (!getProvider(pendingInfo.providerId)) {
    throw new Error('不支持的 OAuth 提供商');
  }

  const db = getDb();

  const [existingBinding] = await db
    .select()
    .from(userOauthBindings)
    .where(
      and(
        eq(userOauthBindings.providerId, pendingInfo.providerId),
        eq(userOauthBindings.providerUserId, pendingInfo.providerUserId),
      ),
    )
    .limit(1);

  if (existingBinding) {
    throw new Error('该 OAuth 账号已被绑定');
  }

  const [settings] = await db
    .select({ inviteCodeEnabled: teamSettings.inviteCodeEnabled, registrationEnabled: teamSettings.registrationEnabled })
    .from(teamSettings)
    .where(eq(teamSettings.id, 1));

  if (settings?.registrationEnabled === false) {
    throw new Error('系统已关闭注册');
  }

  const inviteCodeEnabled = settings?.inviteCodeEnabled ?? true;
  if (inviteCodeEnabled) {
    if (!inviteCode) throw new Error('邀请码不能为空');
    const [invite] = await db.select().from(inviteCodes).where(eq(inviteCodes.code, inviteCode)).limit(1);
    if (!invite) throw new Error('邀请码不存在');
    if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) throw new Error('邀请码已过期');
    if (invite.maxUses > 0 && invite.currentUses >= invite.maxUses) throw new Error('邀请码已达到使用上限');
  }

  const userInfo: OAuthUserInfo = {
    providerId: pendingInfo.providerId,
    providerUserId: pendingInfo.providerUserId,
    email: pendingInfo.email,
    name: pendingInfo.name,
    avatar: pendingInfo.avatar,
    raw: pendingInfo.raw,
  };

  const newUser = await createUserFromOAuth(userInfo, 'member');
  await attachBinding(newUser.id, userInfo);

  if (inviteCodeEnabled) {
    await db
      .update(inviteCodes)
      .set({ currentUses: sql`${inviteCodes.currentUses} + 1` })
      .where(eq(inviteCodes.code, inviteCode));
  }

  await logOperation({
    userId: newUser.id,
    action: 'oauth_register',
    targetType: 'user',
    targetId: newUser.id,
    detail: { providerId: pendingInfo.providerId, providerUserId: pendingInfo.providerUserId },
  });

  return issueSession(newUser, deviceInfo);
}

export async function exchangeOAuthTicket(ticket: string) {
  const payload = await consumeLoginTicket(ticket);
  if (!payload) {
    throw new Error('登录票据无效或已过期，请重新登录');
  }
  return payload;
}

export async function unbindOAuthFromAccount(userId: string, providerId: string) {
  const db = getDb();

  const [user] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) throw new Error('用户不存在');

  const bindings = await db.select().from(userOauthBindings).where(eq(userOauthBindings.userId, userId));
  const binding = bindings.find((b: { providerId: string; id: string }) => b.providerId === providerId);
  if (!binding) throw new Error('未绑定该 OAuth 提供商');

  if (!user.passwordHash && bindings.length <= 1) {
    throw new Error('无法解绑最后一个认证方式，请先设置密码或绑定其他 OAuth');
  }

  await db.delete(userOauthBindings).where(eq(userOauthBindings.id, binding.id));

  await logOperation({
    userId,
    action: 'oauth_unbind',
    targetType: 'user',
    targetId: userId,
    detail: { providerId },
  });

  return { success: true };
}

export async function getUserBindings(userId: string) {
  const db = getDb();
  const bindings = await db
    .select({
      id: userOauthBindings.id,
      providerId: userOauthBindings.providerId,
      providerEmail: userOauthBindings.providerEmail,
      providerName: userOauthBindings.providerName,
      providerAvatar: userOauthBindings.providerAvatar,
      createdAt: userOauthBindings.createdAt,
    })
    .from(userOauthBindings)
    .where(eq(userOauthBindings.userId, userId));

  return bindings.map((b: { providerId: string; [key: string]: unknown }) => {
    const prov = getProvider(b.providerId);
    return {
      ...b,
      providerDisplayName: prov?.name || b.providerId,
    };
  });
}

/** 供前端展示回调地址 */
export async function getCallbackUrlForProvider(providerId: string, requestOrigin?: string) {
  const siteBase = await resolveSiteBaseUrl(requestOrigin);
  return buildOAuthCallbackUrl(siteBase, providerId);
}

export { buildFrontendUrl, resolveSiteBaseUrl };
