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

export async function oauthConfigRoutes(app: FastifyInstance) {
  app.get('/providers', { preHandler: [authenticate] }, async (_request: FastifyRequest, _reply: FastifyReply) => {
    const db = getDb();
    const configs = await db.select({
      id: oauthProviders.id,
      providerId: oauthProviders.providerId,
      enabled: oauthProviders.enabled,
      clientId: oauthProviders.clientId,
      scope: oauthProviders.scope,
      customAuthorizeUrl: oauthProviders.customAuthorizeUrl,
      customTokenUrl: oauthProviders.customTokenUrl,
      customUserInfoUrl: oauthProviders.customUserInfoUrl,
      createdAt: oauthProviders.createdAt,
      updatedAt: oauthProviders.updatedAt,
    }).from(oauthProviders);

    return {
      providers: configs.map((c: { clientId: string; [key: string]: unknown }) => ({
        ...c,
        clientIdMasked: c.clientId.length > 8 ? c.clientId.slice(0, 4) + '****' + c.clientId.slice(-4) : '****',
        clientId: undefined,
        availableProviders: undefined,
      })),
      availableProviders: getRegisteredProviderIds().map((id: string) => {
        const p = getProvider(id);
        return { id, name: p?.name || id, type: p?.type || 'oauth2' };
      }),
    };
  });

  app.post('/providers', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      providerId?: string;
      clientId?: string;
      clientSecret?: string;
      scope?: string;
      enabled?: boolean;
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

    const db = getDb();

    const [existing] = await db.select({ id: oauthProviders.id }).from(oauthProviders)
      .where(eq(oauthProviders.providerId, body.providerId))
      .limit(1);

    if (existing) {
      return reply.status(400).send({ error: '该 OAuth 提供商已配置，请使用更新接口' });
    }

    const created = await insertReturningOne<{
      id: string;
      providerId: string;
      enabled: boolean;
      clientId: string;
      scope: string | null;
      customAuthorizeUrl: string | null;
      customTokenUrl: string | null;
      customUserInfoUrl: string | null;
      createdAt: Date;
      updatedAt: Date;
    }>(
      oauthProviders,
      {
        providerId: body.providerId,
        enabled: body.enabled !== false,
        clientId: body.clientId,
        clientSecret: encrypt(body.clientSecret),
        scope: body.scope || null,
        customAuthorizeUrl: body.customAuthorizeUrl || null,
        customTokenUrl: body.customTokenUrl || null,
        customUserInfoUrl: body.customUserInfoUrl || null,
      },
      {
        id: oauthProviders.id,
        providerId: oauthProviders.providerId,
        enabled: oauthProviders.enabled,
        clientId: oauthProviders.clientId,
        scope: oauthProviders.scope,
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
      content: `已新增 ${provider.name} (${body.providerId}) 的 OAuth 登录入口。`,
      level: 'info' as const,
      metadata: { providerId: body.providerId },
    });

    return {
      ...created,
      clientIdMasked: created.clientId.length > 8 ? created.clientId.slice(0, 4) + '****' + created.clientId.slice(-4) : '****',
      clientId: undefined,
    };
  });

  app.put('/providers/:id', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      clientId?: string;
      clientSecret?: string;
      scope?: string;
      enabled?: boolean;
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
    if (body.customAuthorizeUrl !== undefined) updateData.customAuthorizeUrl = body.customAuthorizeUrl || null;
    if (body.customTokenUrl !== undefined) updateData.customTokenUrl = body.customTokenUrl || null;
    if (body.customUserInfoUrl !== undefined) updateData.customUserInfoUrl = body.customUserInfoUrl || null;

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
        content: `OAuth 提供商 ${existing.providerId} 的关键配置已被更新${body.enabled === false ? '，已禁用' : ''}。`,
        level: 'warning' as const,
        metadata: { providerId: existing.providerId },
      });
    }

    const [updated] = await db.select({
      id: oauthProviders.id,
      providerId: oauthProviders.providerId,
      enabled: oauthProviders.enabled,
      clientId: oauthProviders.clientId,
      scope: oauthProviders.scope,
      customAuthorizeUrl: oauthProviders.customAuthorizeUrl,
      customTokenUrl: oauthProviders.customTokenUrl,
      customUserInfoUrl: oauthProviders.customUserInfoUrl,
      createdAt: oauthProviders.createdAt,
      updatedAt: oauthProviders.updatedAt,
    }).from(oauthProviders).where(eq(oauthProviders.id, id)).limit(1);

    return {
      ...updated,
      clientIdMasked: updated!.clientId.length > 8 ? updated!.clientId.slice(0, 4) + '****' + updated!.clientId.slice(-4) : '****',
      clientId: undefined,
    };
  });

  app.delete('/providers/:id', { preHandler: [authenticate, requireRole('admin')] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const confirmed = request.headers['x-confirm-delete'] === 'true';

    const db = getDb();

    const [existing] = await db.select({
      id: oauthProviders.id,
      providerId: oauthProviders.providerId,
    }).from(oauthProviders).where(eq(oauthProviders.id, id)).limit(1);

    if (!existing) {
      return reply.status(404).send({ error: 'OAuth 提供商配置不存在' });
    }

    const [bindingCount] = await db.select({ count: sql<number>`count(*)` })
      .from(userOauthBindings)
      .where(eq(userOauthBindings.providerId, existing.providerId));

    const boundUserCount = Number(bindingCount?.count ?? 0);

    if (boundUserCount > 0 && !confirmed) {
      return {
        requiresConfirmation: true,
        warning: `该 OAuth 提供商下有 ${boundUserCount} 个用户绑定，删除后相关用户将无法通过该方式登录。确定要删除吗？`,
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
      content: `OAuth 提供商 ${existing.providerId} 已被删除，连带影响 ${boundUserCount} 个用户的登录方式。`,
      level: 'warning' as const,
      metadata: { providerId: existing.providerId, boundUserCount },
    });

    return { success: true };
  });
}
