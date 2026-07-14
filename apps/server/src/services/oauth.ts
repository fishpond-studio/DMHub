import { eq, and, sql } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { getDb } from '../db/index.js';
import { users, userOauthBindings, oauthProviders, inviteCodes, teamSettings } from '../db/schema.js';
import { insertReturningOne } from '../db/helpers.js';
import { signAccessToken, signRefreshToken } from '../lib/jwt.js';
import { getProvider, type OAuthProviderConfig, type OAuthUserInfo } from '../lib/oauth/providers/index.js';
import { generateState, verifyState } from '../lib/oauth/crypto.js';
import { decrypt } from '../lib/crypto.js';
import { logOperation } from '../lib/log.js';
import { config } from '../config/index.js';

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

export async function listEnabledProviders() {
  const db = getDb();
  const result = await db.select({
    providerId: oauthProviders.providerId,
  }).from(oauthProviders).where(eq(oauthProviders.enabled, true));

  return result.map((p: { providerId: string }) => {
    const provider = getProvider(p.providerId);
    return {
      providerId: p.providerId,
      name: provider?.name || p.providerId,
      type: provider?.type || 'oauth2',
    };
  });
}

export async function buildAuthorizationUrl(
  providerId: string,
  redirectUri: string,
): Promise<{ url: string; state: string }> {
  const provider = getProvider(providerId);
  if (!provider) {
    throw new Error('不支持的 OAuth 提供商: ' + providerId);
  }

  const db = getDb();
  const [dbConfig] = await db.select().from(oauthProviders)
    .where(and(eq(oauthProviders.providerId, providerId), eq(oauthProviders.enabled, true)))
    .limit(1);

  if (!dbConfig) {
    throw new Error('OAuth 提供商未配置或未启用: ' + providerId);
  }

  const providerConfig: OAuthProviderConfig = {
    clientId: dbConfig.clientId,
    clientSecret: decrypt(dbConfig.clientSecret),
    scope: dbConfig.scope || undefined,
    authorizeUrl: dbConfig.customAuthorizeUrl || undefined,
    tokenUrl: dbConfig.customTokenUrl || undefined,
    userInfoUrl: dbConfig.customUserInfoUrl || undefined,
  };

  const state = generateState(providerId, redirectUri);
  const url = provider.getAuthorizationUrl(providerConfig, state, redirectUri);

  return { url, state };
}

export async function handleOAuthCallback(
  providerId: string,
  code: string,
  state: string,
) {
  const provider = getProvider(providerId);
  if (!provider) {
    throw new Error('不支持的 OAuth 提供商: ' + providerId);
  }

  try {
    verifyState(state);
  } catch {
    throw new Error('OAuth state 无效或已过期');
  }

  const db = getDb();
  const [dbConfig] = await db.select().from(oauthProviders)
    .where(and(eq(oauthProviders.providerId, providerId), eq(oauthProviders.enabled, true)))
    .limit(1);

  if (!dbConfig) {
    throw new Error('OAuth 提供商未配置或未启用');
  }

  const providerConfig: OAuthProviderConfig = {
    clientId: dbConfig.clientId,
    clientSecret: decrypt(dbConfig.clientSecret),
    scope: dbConfig.scope || undefined,
    authorizeUrl: dbConfig.customAuthorizeUrl || undefined,
    tokenUrl: dbConfig.customTokenUrl || undefined,
    userInfoUrl: dbConfig.customUserInfoUrl || undefined,
  };

  const userInfo = await provider.handleCallback(providerConfig, code, '');

  const [existingBinding] = await db.select().from(userOauthBindings)
    .where(and(
      eq(userOauthBindings.providerId, userInfo.providerId),
      eq(userOauthBindings.providerUserId, userInfo.providerUserId),
    ))
    .limit(1);

  if (existingBinding) {
    const [user] = await db.select({
      id: users.id,
      username: users.username,
      email: users.email,
      role: users.role,
      status: users.status,
    }).from(users).where(eq(users.id, existingBinding.userId)).limit(1);

    if (!user) {
      throw new Error('关联用户不存在');
    }
    if (user.status === 'disabled') {
      throw new Error('账号已被禁用');
    }

    await db.update(userOauthBindings).set({
      providerEmail: userInfo.email || null,
      providerName: userInfo.name || null,
      providerAvatar: userInfo.avatar || null,
      rawData: userInfo.raw || null,
      updatedAt: new Date(),
    }).where(eq(userOauthBindings.id, existingBinding.id));

    await logOperation({
      userId: user.id,
      action: 'oauth_login',
      targetType: 'user',
      targetId: user.id,
      detail: { providerId: userInfo.providerId, providerUserId: userInfo.providerUserId },
    });

    const accessToken = signAccessToken(user.id, user.role);
    const refreshToken = signRefreshToken(user.id);

    return {
      type: 'login' as const,
      accessToken,
      refreshToken,
      user: { id: user.id, username: user.username, email: user.email, role: user.role },
    };
  }

  const userCount = await db.select({ count: sql<number>`count(*)` }).from(users);
  const hasUsers = Number(userCount[0]?.count ?? 0) > 0;

  const [settings] = await db.select({
    initialized: teamSettings.initialized,
    inviteCodeEnabled: teamSettings.inviteCodeEnabled,
    registrationEnabled: teamSettings.registrationEnabled,
  }).from(teamSettings).where(eq(teamSettings.id, 1));

  if (!hasUsers && !settings?.initialized) {
    const newUser = await insertReturningOne<{ id: string; username: string; email: string | null; role: string }>(
      users,
      {
        username: `admin_${userInfo.providerUserId.slice(0, 8)}`,
        email: userInfo.email || null,
        displayName: userInfo.name || null,
        avatarUrl: userInfo.avatar || null,
        role: 'admin',
        status: 'active',
      },
      {
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
      },
    );

    await db.insert(userOauthBindings).values({
      userId: newUser.id,
      providerId: userInfo.providerId,
      providerUserId: userInfo.providerUserId,
      providerEmail: userInfo.email || null,
      providerName: userInfo.name || null,
      providerAvatar: userInfo.avatar || null,
      rawData: userInfo.raw || null,
    });

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

    const accessToken = signAccessToken(newUser.id, newUser.role);
    const refreshToken = signRefreshToken(newUser.id);

    return {
      type: 'login' as const,
      accessToken,
      refreshToken,
      user: { id: newUser.id, username: newUser.username, email: newUser.email, role: newUser.role },
    };
  }

  const inviteCodeEnabled = settings?.inviteCodeEnabled ?? true;
  const registrationEnabled = settings?.registrationEnabled ?? true;

  if (!registrationEnabled) {
    throw new Error('系统已关闭注册');
  }

  if (!inviteCodeEnabled) {
    const newUser = await insertReturningOne<{ id: string; username: string; email: string | null; role: string }>(
      users,
      {
        username: `${userInfo.providerId}_${userInfo.providerUserId.slice(0, 8)}`,
        email: userInfo.email || null,
        displayName: userInfo.name || null,
        avatarUrl: userInfo.avatar || null,
        role: 'member',
        status: 'active',
      },
      {
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
      },
    );

    await db.insert(userOauthBindings).values({
      userId: newUser.id,
      providerId: userInfo.providerId,
      providerUserId: userInfo.providerUserId,
      providerEmail: userInfo.email || null,
      providerName: userInfo.name || null,
      providerAvatar: userInfo.avatar || null,
      rawData: userInfo.raw || null,
    });

    const accessToken = signAccessToken(newUser.id, newUser.role);
    const refreshToken = signRefreshToken(newUser.id);

    return {
      type: 'login' as const,
      accessToken,
      refreshToken,
      user: { id: newUser.id, username: newUser.username, email: newUser.email, role: newUser.role },
    };
  }

  const pendingToken = signOAuthPendingToken(userInfo);

  return {
    type: 'needs_invite' as const,
    pendingToken,
    providerId: userInfo.providerId,
    email: userInfo.email,
    name: userInfo.name,
    avatar: userInfo.avatar,
  };
}

export async function registerWithOAuth(
  pendingToken: string,
  inviteCode: string,
) {
  let pendingInfo: OAuthPendingToken;
  try {
    pendingInfo = verifyOAuthPendingToken(pendingToken);
  } catch {
    throw new Error('OAuth 令牌无效或已过期，请重新登录');
  }

  const provider = getProvider(pendingInfo.providerId);
  if (!provider) {
    throw new Error('不支持的 OAuth 提供商');
  }

  const db = getDb();

  const [existingBinding] = await db.select().from(userOauthBindings)
    .where(and(
      eq(userOauthBindings.providerId, pendingInfo.providerId),
      eq(userOauthBindings.providerUserId, pendingInfo.providerUserId),
    ))
    .limit(1);

  if (existingBinding) {
    throw new Error('该 OAuth 账号已被绑定');
  }

  if (!inviteCode) {
    throw new Error('邀请码不能为空');
  }

  const [settings] = await db.select({ inviteCodeEnabled: teamSettings.inviteCodeEnabled }).from(teamSettings).where(eq(teamSettings.id, 1));
  const inviteCodeEnabled = settings?.inviteCodeEnabled ?? true;

  if (inviteCodeEnabled) {
    const [invite] = await db.select().from(inviteCodes).where(eq(inviteCodes.code, inviteCode)).limit(1);
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

  const newUser = await insertReturningOne<{ id: string; username: string; email: string | null; role: string }>(
    users,
    {
      username: `${pendingInfo.providerId}_${pendingInfo.providerUserId.slice(0, 8)}`,
      email: pendingInfo.email || null,
      displayName: pendingInfo.name || null,
      avatarUrl: pendingInfo.avatar || null,
      role: 'member',
      status: 'active',
    },
    {
      id: users.id,
      username: users.username,
      email: users.email,
      role: users.role,
    },
  );

  await db.insert(userOauthBindings).values({
    userId: newUser.id,
    providerId: pendingInfo.providerId,
    providerUserId: pendingInfo.providerUserId,
    providerEmail: pendingInfo.email || null,
    providerName: pendingInfo.name || null,
    providerAvatar: pendingInfo.avatar || null,
    rawData: pendingInfo.raw || null,
  });

  if (inviteCodeEnabled) {
    await db.update(inviteCodes)
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

  const accessToken = signAccessToken(newUser.id, newUser.role);
  const refreshToken = signRefreshToken(newUser.id);

  return {
    accessToken,
    refreshToken,
    user: { id: newUser.id, username: newUser.username, email: newUser.email, role: newUser.role },
  };
}

export async function bindOAuthToAccount(
  userId: string,
  providerId: string,
  code: string,
  redirectUri: string,
) {
  const provider = getProvider(providerId);
  if (!provider) {
    throw new Error('不支持的 OAuth 提供商: ' + providerId);
  }

  const db = getDb();
  const [dbConfig] = await db.select().from(oauthProviders)
    .where(and(eq(oauthProviders.providerId, providerId), eq(oauthProviders.enabled, true)))
    .limit(1);

  if (!dbConfig) {
    throw new Error('OAuth 提供商未配置或未启用');
  }

  const providerConfig: OAuthProviderConfig = {
    clientId: dbConfig.clientId,
    clientSecret: decrypt(dbConfig.clientSecret),
    scope: dbConfig.scope || undefined,
    authorizeUrl: dbConfig.customAuthorizeUrl || undefined,
    tokenUrl: dbConfig.customTokenUrl || undefined,
    userInfoUrl: dbConfig.customUserInfoUrl || undefined,
  };

  const userInfo = await provider.handleCallback(providerConfig, code, redirectUri);

  const [existingBinding] = await db.select().from(userOauthBindings)
    .where(and(
      eq(userOauthBindings.providerId, userInfo.providerId),
      eq(userOauthBindings.providerUserId, userInfo.providerUserId),
    ))
    .limit(1);

  if (existingBinding) {
    if (existingBinding.userId === userId) {
      throw new Error('您已绑定该 OAuth 账号');
    }
    throw new Error('该 OAuth 账号已被其他用户绑定');
  }

  await db.insert(userOauthBindings).values({
    userId,
    providerId: userInfo.providerId,
    providerUserId: userInfo.providerUserId,
    providerEmail: userInfo.email || null,
    providerName: userInfo.name || null,
    providerAvatar: userInfo.avatar || null,
    rawData: userInfo.raw || null,
  });

  await logOperation({
    userId,
    action: 'oauth_bind',
    targetType: 'user',
    targetId: userId,
    detail: { providerId: userInfo.providerId, providerUserId: userInfo.providerUserId },
  });

  return { success: true };
}

export async function unbindOAuthFromAccount(
  userId: string,
  providerId: string,
) {
  const db = getDb();

  const [user] = await db.select({
    passwordHash: users.passwordHash,
  }).from(users).where(eq(users.id, userId)).limit(1);

  if (!user) {
    throw new Error('用户不存在');
  }

  const bindings = await db.select().from(userOauthBindings)
    .where(eq(userOauthBindings.userId, userId));

  const binding = bindings.find((b: { providerId: string; id: string }) => b.providerId === providerId);
  if (!binding) {
    throw new Error('未绑定该 OAuth 提供商');
  }

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
  const bindings = await db.select({
    id: userOauthBindings.id,
    providerId: userOauthBindings.providerId,
    providerEmail: userOauthBindings.providerEmail,
    providerName: userOauthBindings.providerName,
    providerAvatar: userOauthBindings.providerAvatar,
    createdAt: userOauthBindings.createdAt,
  }).from(userOauthBindings).where(eq(userOauthBindings.userId, userId));

  return bindings.map((b: { providerId: string; [key: string]: unknown }) => {
    const prov = getProvider(b.providerId);
    return {
      ...b,
      providerDisplayName: prov?.name || b.providerId,
    };
  });
}
