import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { oauthProviders, userOauthBindings } from '../db/schema.js';
import { insertReturningOne } from '../db/helpers.js';
import { encrypt } from '../lib/crypto.js';
import { getProvider, getRegisteredProviderIds } from '../lib/oauth/providers/index.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { logOperation } from '../lib/log.js';
import { triggerNotification, notifyAdmins } from '../services/notification.js';
import { getOAuthCallbackHint } from '../services/oauth.js';
import { requestOrigin } from './oauth.js';

function maskClientId(clientId: string) {
  return clientId.length > 8
    ? clientId.slice(0, 4) + '****' + clientId.slice(-4)
    : '****';
}

function publicProviderShape(c: {
  id: string;
  providerId: string;
  enabled: boolean;
  clientId: string;
  scope: string | null;
  wellKnownUrl?: string | null;
  customAuthorizeUrl: string | null;
  customTokenUrl: string | null;
  customUserInfoUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: c.id,
    providerId: c.providerId,
    enabled: c.enabled,
    clientIdMasked: maskClientId(c.clientId),
    scope: c.scope,
    wellKnownUrl: c.wellKnownUrl ?? null,
    // 可选端点覆盖
    authorizeUrl: c.customAuthorizeUrl,
    tokenUrl: c.customTokenUrl,
    userInfoUrl: c.customUserInfoUrl,
    customAuthorizeUrl: c.customAuthorizeUrl,
    customTokenUrl: c.customTokenUrl,
    customUserInfoUrl: c.customUserInfoUrl,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export async function oauthConfigRoutes(app: FastifyInstance) {
  app.get('/providers', { preHandler: [authenticate] }, async (request: FastifyRequest) => {
    const db = getDb();
    const configs = await db
      .select({
        id: oauthProviders.id,
        providerId: oauthProviders.providerId,
        enabled: oauthProviders.enabled,
        clientId: oauthProviders.clientId,
        scope: oauthProviders.scope,
        wellKnownUrl: oauthProviders.wellKnownUrl,
        customAuthorizeUrl: oauthProviders.customAuthorizeUrl,
        customTokenUrl: oauthProviders.customTokenUrl,
        customUserInfoUrl: oauthProviders.customUserInfoUrl,
        createdAt: oauthProviders.createdAt,
        updatedAt: oauthProviders.updatedAt,
      })
      .from(oauthProviders);

    let homepageUrl = '';
    const urlsByProvider: Record<string, { homepageUrl: string; redirectUrl: string }> = {};
    try {
      for (const c of configs) {
        const hint = await getOAuthCallbackHint(c.providerId, requestOrigin(request));
        homepageUrl = hint.homepageUrl;
        urlsByProvider[c.providerId] = {
          homepageUrl: hint.homepageUrl,
          redirectUrl: hint.redirectUrl,
        };
      }
      // 未配置时也给 OIDC 默认展示
      if (!homepageUrl) {
        const hint = await getOAuthCallbackHint('oidc', requestOrigin(request));
        homepageUrl = hint.homepageUrl;
        urlsByProvider.oidc = {
          homepageUrl: hint.homepageUrl,
          redirectUrl: hint.redirectUrl,
        };
      }
    } catch {
      // 站点 URL 未配置
    }

    return {
      providers: configs.map((c: any) => ({
        ...publicProviderShape(c as any),
        homepageUrl: urlsByProvider[c.providerId]?.homepageUrl || homepageUrl || null,
        redirectUrl: urlsByProvider[c.providerId]?.redirectUrl || null,
      })),
      availableProviders: getRegisteredProviderIds().map((id: string) => {
        const p = getProvider(id);
        return { id, name: p?.name || id, type: p?.type || 'oauth2' };
      }),
      homepageUrl: homepageUrl || null,
      // OIDC 默认登记地址（即使尚未添加配置也可预览）
      oidcUrls: urlsByProvider.oidc || urlsByProvider.custom || null,
    };
  });

  app.post(
    '/providers',
    { preHandler: [authenticate, requireRole('admin')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as {
        providerId?: string;
        clientId?: string;
        clientSecret?: string;
        scope?: string;
        enabled?: boolean;
        wellKnownUrl?: string;
        authorizeUrl?: string;
        tokenUrl?: string;
        userInfoUrl?: string;
        // 兼容旧字段名
        customAuthorizeUrl?: string;
        customTokenUrl?: string;
        customUserInfoUrl?: string;
      };

      if (!body?.providerId || !body?.clientId || !body?.clientSecret) {
        return reply.status(400).send({ error: '缺少必要字段: providerId, clientId, clientSecret' });
      }

      const provider = getProvider(body.providerId);
      if (!provider) {
        return reply.status(400).send({ error: '不支持的 OAuth 提供商: ' + body.providerId });
      }

      const isOidc = body.providerId === 'oidc' || body.providerId === 'custom';
      if (isOidc) {
        const wellKnown = body.wellKnownUrl?.trim();
        const auth = (body.authorizeUrl || body.customAuthorizeUrl)?.trim();
        const token = (body.tokenUrl || body.customTokenUrl)?.trim();
        if (!wellKnown && !(auth && token)) {
          return reply.status(400).send({
            error: 'OIDC 请填写 Well-Known URL，或同时填写授权端点与 Token 端点',
          });
        }
      }

      const db = getDb();

      const [existing] = await db
        .select({ id: oauthProviders.id })
        .from(oauthProviders)
        .where(eq(oauthProviders.providerId, body.providerId))
        .limit(1);

      if (existing) {
        return reply.status(400).send({ error: '该 OAuth 提供商已配置，请使用更新接口' });
      }

      const created = await insertReturningOne(
        oauthProviders,
        {
          providerId: body.providerId,
          enabled: body.enabled !== false,
          clientId: body.clientId,
          clientSecret: encrypt(body.clientSecret),
          scope: body.scope || null,
          wellKnownUrl: body.wellKnownUrl || null,
          customAuthorizeUrl: body.authorizeUrl || body.customAuthorizeUrl || null,
          customTokenUrl: body.tokenUrl || body.customTokenUrl || null,
          customUserInfoUrl: body.userInfoUrl || body.customUserInfoUrl || null,
        },
        {
          id: oauthProviders.id,
          providerId: oauthProviders.providerId,
          enabled: oauthProviders.enabled,
          clientId: oauthProviders.clientId,
          scope: oauthProviders.scope,
          wellKnownUrl: oauthProviders.wellKnownUrl,
          customAuthorizeUrl: oauthProviders.customAuthorizeUrl,
          customTokenUrl: oauthProviders.customTokenUrl,
          customUserInfoUrl: oauthProviders.customUserInfoUrl,
          createdAt: oauthProviders.createdAt,
          updatedAt: oauthProviders.updatedAt,
        },
      );

      await logOperation({
        userId: request.user!.userId,
        action: 'create_oauth_provider',
        targetType: 'oauth_provider',
        targetId: created.id,
        detail: { providerId: body.providerId },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      await notifyAdmins('oauth_provider.created', {
        title: 'OAuth 提供商已新增',
        content: `已新增 ${provider.name} (${body.providerId}) 登录入口。`,
        level: 'info' as const,
        metadata: { providerId: body.providerId },
      });

      let homepageUrl: string | null = null;
      let redirectUrl: string | null = null;
      try {
        const hint = await getOAuthCallbackHint(body.providerId, requestOrigin(request));
        homepageUrl = hint.homepageUrl;
        redirectUrl = hint.redirectUrl;
      } catch {
        // ignore
      }

      return {
        ...publicProviderShape(created as any),
        homepageUrl,
        redirectUrl,
      };
    },
  );

  app.put(
    '/providers/:id',
    { preHandler: [authenticate, requireRole('admin')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = request.body as {
        clientId?: string;
        clientSecret?: string;
        scope?: string;
        enabled?: boolean;
        wellKnownUrl?: string;
        authorizeUrl?: string;
        tokenUrl?: string;
        userInfoUrl?: string;
        customAuthorizeUrl?: string;
        customTokenUrl?: string;
        customUserInfoUrl?: string;
      };

      const db = getDb();

      const [existing] = await db.select().from(oauthProviders).where(eq(oauthProviders.id, id)).limit(1);
      if (!existing) {
        return reply.status(404).send({ error: 'OAuth 提供商配置不存在' });
      }

      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (body.clientId !== undefined) updateData.clientId = body.clientId;
      if (body.clientSecret !== undefined) updateData.clientSecret = encrypt(body.clientSecret);
      if (body.scope !== undefined) updateData.scope = body.scope || null;
      if (body.enabled !== undefined) updateData.enabled = body.enabled;
      if (body.wellKnownUrl !== undefined) updateData.wellKnownUrl = body.wellKnownUrl || null;
      if (body.authorizeUrl !== undefined || body.customAuthorizeUrl !== undefined) {
        updateData.customAuthorizeUrl = body.authorizeUrl ?? body.customAuthorizeUrl ?? null;
      }
      if (body.tokenUrl !== undefined || body.customTokenUrl !== undefined) {
        updateData.customTokenUrl = body.tokenUrl ?? body.customTokenUrl ?? null;
      }
      if (body.userInfoUrl !== undefined || body.customUserInfoUrl !== undefined) {
        updateData.customUserInfoUrl = body.userInfoUrl ?? body.customUserInfoUrl ?? null;
      }

      await db.update(oauthProviders).set(updateData).where(eq(oauthProviders.id, id));

      await logOperation({
        userId: request.user!.userId,
        action: 'update_oauth_provider',
        targetType: 'oauth_provider',
        targetId: id,
        detail: { updatedFields: Object.keys(updateData).filter((k) => k !== 'updatedAt') },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      if (body.clientSecret !== undefined || body.clientId !== undefined || body.enabled !== undefined) {
        await notifyAdmins('oauth_provider.updated', {
          title: 'OAuth 提供商配置变更',
          content: `OAuth 提供商 ${existing.providerId} 的配置已更新${body.enabled === false ? '，已禁用' : ''}。`,
          level: 'warning' as const,
          metadata: { providerId: existing.providerId },
        });
      }

      const [updated] = await db
        .select({
          id: oauthProviders.id,
          providerId: oauthProviders.providerId,
          enabled: oauthProviders.enabled,
          clientId: oauthProviders.clientId,
          scope: oauthProviders.scope,
          wellKnownUrl: oauthProviders.wellKnownUrl,
          customAuthorizeUrl: oauthProviders.customAuthorizeUrl,
          customTokenUrl: oauthProviders.customTokenUrl,
          customUserInfoUrl: oauthProviders.customUserInfoUrl,
          createdAt: oauthProviders.createdAt,
          updatedAt: oauthProviders.updatedAt,
        })
        .from(oauthProviders)
        .where(eq(oauthProviders.id, id))
        .limit(1);

      let homepageUrl: string | null = null;
      let redirectUrl: string | null = null;
      try {
        const hint = await getOAuthCallbackHint(updated!.providerId, requestOrigin(request));
        homepageUrl = hint.homepageUrl;
        redirectUrl = hint.redirectUrl;
      } catch {
        // ignore
      }

      return {
        ...publicProviderShape(updated as any),
        homepageUrl,
        redirectUrl,
      };
    },
  );

  app.delete(
    '/providers/:id',
    { preHandler: [authenticate, requireRole('admin')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const confirmed = request.headers['x-confirm-delete'] === 'true';

      const db = getDb();

      const [existing] = await db
        .select({
          id: oauthProviders.id,
          providerId: oauthProviders.providerId,
        })
        .from(oauthProviders)
        .where(eq(oauthProviders.id, id))
        .limit(1);

      if (!existing) {
        return reply.status(404).send({ error: 'OAuth 提供商配置不存在' });
      }

      const [bindingCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(userOauthBindings)
        .where(eq(userOauthBindings.providerId, existing.providerId));

      const boundUserCount = Number(bindingCount?.count ?? 0);

      if (boundUserCount > 0 && !confirmed) {
        return {
          requiresConfirmation: true,
          warning: `该提供商下有 ${boundUserCount} 个用户绑定，删除后相关用户将无法通过该方式登录。确定要删除吗？`,
          boundUserCount,
        };
      }

      await db.delete(oauthProviders).where(eq(oauthProviders.id, id));

      await logOperation({
        userId: request.user!.userId,
        action: 'delete_oauth_provider',
        targetType: 'oauth_provider',
        targetId: id,
        detail: { providerId: existing.providerId, deletedBindings: boundUserCount },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      await triggerNotification('oauth_provider.deleted', {
        title: 'OAuth 提供商已删除',
        content: `OAuth 提供商 ${existing.providerId} 已被删除`,
        level: 'warning' as const,
      });
      await notifyAdmins('oauth_provider.deleted', {
        title: 'OAuth 提供商已删除',
        content: `OAuth 提供商 ${existing.providerId} 已被删除，影响 ${boundUserCount} 个用户绑定。`,
        level: 'warning' as const,
        metadata: { providerId: existing.providerId, boundUserCount },
      });

      return { success: true };
    },
  );
}
