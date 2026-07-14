import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  listEnabledProviders,
  buildAuthorizationUrl,
  handleOAuthCallback,
  registerWithOAuth,
  bindOAuthToAccount,
  unbindOAuthFromAccount,
  getUserBindings,
} from '../services/oauth.js';
import { authenticate } from '../middleware/auth.js';
import { config } from '../config/index.js';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/api/auth',
  maxAge: 7 * 24 * 60 * 60,
};

export async function oauthRoutes(app: FastifyInstance) {
  app.get('/providers', async (_request: FastifyRequest, _reply: FastifyReply) => {
    const providers = await listEnabledProviders();
    return { providers };
  });

  app.get('/:providerId/authorize', async (request: FastifyRequest, reply: FastifyReply) => {
    const { providerId } = request.params as { providerId: string };
    const callbackPath = `/api/auth/oauth/${providerId}/callback`;

    try {
      const result = await buildAuthorizationUrl(providerId, callbackPath);
      reply.redirect(result.url);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.get('/:providerId/callback', async (request: FastifyRequest, reply: FastifyReply) => {
    const { providerId } = request.params as { providerId: string };
    const query = request.query as { code?: string; state?: string; error?: string };

    if (query.error) {
      return reply.redirect(`/oauth/callback?error=${encodeURIComponent(query.error)}`);
    }

    if (!query.code || !query.state) {
      return reply.redirect(`/oauth/callback?error=${encodeURIComponent('缺少授权码或状态')}`);
    }

    try {
      const result = await handleOAuthCallback(providerId, query.code, query.state);

      if (result.type === 'login') {
        reply.setCookie('refresh_token', result.refreshToken, COOKIE_OPTIONS);
        const params = new URLSearchParams({
          access_token: result.accessToken,
          user: JSON.stringify(result.user),
        });
        return reply.redirect(`/oauth/callback?${params.toString()}`);
      }

      if (result.type === 'needs_invite') {
        const params = new URLSearchParams({
          needs_invite: 'true',
          pending_token: result.pendingToken,
          provider_id: result.providerId,
        });
        if (result.email) params.set('email', result.email);
        if (result.name) params.set('name', result.name);
        if (result.avatar) params.set('avatar', result.avatar);
        return reply.redirect(`/oauth/callback?${params.toString()}`);
      }
    } catch (err: any) {
      return reply.redirect(`/oauth/callback?error=${encodeURIComponent(err.message)}`);
    }
  });

  app.post('/:providerId/register', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { pendingToken?: string; code?: string };

    if (!body?.pendingToken || !body?.code) {
      return reply.status(400).send({ error: '缺少必要字段: pendingToken, code' });
    }

    try {
      const result = await registerWithOAuth(body.pendingToken, body.code);
      reply.setCookie('refresh_token', result.refreshToken, COOKIE_OPTIONS);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post('/bind', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { providerId?: string; code?: string; redirectUri?: string };

    if (!body?.providerId || !body?.code) {
      return reply.status(400).send({ error: '缺少必要字段: providerId, code' });
    }

    try {
      const result = await bindOAuthToAccount(
        request.user!.userId,
        body.providerId,
        body.code,
        body.redirectUri || '',
      );
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.delete('/unbind/:providerId', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { providerId } = request.params as { providerId: string };

    try {
      const result = await unbindOAuthFromAccount(request.user!.userId, providerId);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.get('/bindings', { preHandler: [authenticate] }, async (request: FastifyRequest, _reply: FastifyReply) => {
    const bindings = await getUserBindings(request.user!.userId);
    return { bindings };
  });
}
