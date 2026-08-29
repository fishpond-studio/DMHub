import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  listEnabledProviders,
  buildAuthorizationUrl,
  handleOAuthCallback,
  registerWithOAuth,
  unbindOAuthFromAccount,
  getUserBindings,
  exchangeOAuthTicket,
  resolveSiteBaseUrl,
  buildFrontendUrl,
  getOAuthCallbackHint,
} from '../services/oauth.js';
import { authenticate } from '../middleware/auth.js';
import { config } from '../config/index.js';
import { verifyState } from '../lib/oauth/crypto.js';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/api/auth',
  maxAge: 7 * 24 * 60 * 60,
};

export function requestOrigin(request: FastifyRequest): string | undefined {
  const proto = (request.headers['x-forwarded-proto'] as string) || request.protocol;
  const host = (request.headers['x-forwarded-host'] as string) || request.headers.host;
  if (!host) return undefined;
  return `${proto}://${host}`;
}

function frontendRedirect(siteBase: string, pathAndQuery: string) {
  return buildFrontendUrl(siteBase, pathAndQuery);
}

/**
 * 统一处理 OAuth/OIDC 回调 HTTP 响应（标准路径与 /oauth/oidc 共用）
 */
export async function processOAuthHttpCallback(
  providerId: string,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const query = request.query as {
    code?: string;
    state?: string;
    error?: string;
    error_description?: string;
  };

  let siteBase: string;
  try {
    siteBase = await resolveSiteBaseUrl(requestOrigin(request));
  } catch {
    return reply.status(500).send({ error: '站点 URL 未配置' });
  }

  if (query.error) {
    const msg = query.error_description || query.error;
    return reply.redirect(
      frontendRedirect(siteBase, `/oauth/callback?error=${encodeURIComponent(msg)}`),
    );
  }

  if (!query.code || !query.state) {
    return reply.redirect(
      frontendRedirect(siteBase, `/oauth/callback?error=${encodeURIComponent('缺少授权码或 state')}`),
    );
  }

  try {
    const result = await handleOAuthCallback(
      providerId,
      query.code,
      query.state,
      request.headers['user-agent'],
    );

    if (result.type === 'login') {
      return reply.redirect(
        frontendRedirect(siteBase, `/oauth/callback?ticket=${encodeURIComponent(result.ticket)}`),
      );
    }

    if (result.type === 'bound') {
      return reply.redirect(
        frontendRedirect(
          siteBase,
          `/oauth/callback?bound=1&provider_id=${encodeURIComponent(result.providerId)}`,
        ),
      );
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
      return reply.redirect(frontendRedirect(siteBase, `/oauth/callback?${params.toString()}`));
    }

    return reply.redirect(
      frontendRedirect(siteBase, `/oauth/callback?error=${encodeURIComponent('未知回调结果')}`),
    );
  } catch (err: any) {
    return reply.redirect(
      frontendRedirect(
        siteBase,
        `/oauth/callback?error=${encodeURIComponent(err.message || 'OAuth 失败')}`,
      ),
    );
  }
}

/**
 * OIDC 简洁回调：GET /oauth/oidc?code&state
 * providerId 从 state 中读取（oidc 或 custom）
 */
export async function processOidcShortCallback(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as { state?: string; code?: string; error?: string };
  if (query.error || !query.state) {
    // 无 state 时按 oidc 处理错误跳转
    return processOAuthHttpCallback('oidc', request, reply);
  }
  try {
    const st = verifyState(query.state);
    const pid = st.providerId === 'custom' ? 'custom' : 'oidc';
    // 允许 state 里是 oidc 或 custom
    if (st.providerId !== 'oidc' && st.providerId !== 'custom') {
      throw new Error('此回调地址仅用于 OIDC 登录');
    }
    return processOAuthHttpCallback(pid === 'custom' ? st.providerId : st.providerId, request, reply);
  } catch (err: any) {
    let siteBase = '';
    try {
      siteBase = await resolveSiteBaseUrl(requestOrigin(request));
    } catch {
      return reply.status(400).send({ error: err.message });
    }
    return reply.redirect(
      frontendRedirect(siteBase, `/oauth/callback?error=${encodeURIComponent(err.message)}`),
    );
  }
}

export async function oauthRoutes(app: FastifyInstance) {
  app.get('/providers', async () => {
    const providers = await listEnabledProviders();
    return { providers };
  });

  /** 公开：主页 URL + 重定向 URL（配置 IdP 时复制） */
  app.get('/:providerId/callback-url', async (request: FastifyRequest, reply: FastifyReply) => {
    const { providerId } = request.params as { providerId: string };
    try {
      const hint = await getOAuthCallbackHint(providerId, requestOrigin(request));
      return {
        providerId,
        homepageUrl: hint.homepageUrl,
        redirectUrl: hint.redirectUrl,
        siteUrl: hint.siteUrl,
        callbackUrl: hint.callbackUrl,
      };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.get('/:providerId/authorize', async (request: FastifyRequest, reply: FastifyReply) => {
    const { providerId } = request.params as { providerId: string };
    try {
      const { url } = await buildAuthorizationUrl({
        providerId,
        intent: 'login',
        requestOrigin: requestOrigin(request),
      });
      return reply.redirect(url);
    } catch (err: any) {
      const siteBase = await resolveSiteBaseUrl(requestOrigin(request)).catch(() => '');
      if (siteBase) {
        return reply.redirect(
          frontendRedirect(siteBase, `/oauth/callback?error=${encodeURIComponent(err.message)}`),
        );
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post(
    '/:providerId/bind/start',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { providerId } = request.params as { providerId: string };
      try {
        const { url, callbackUrl } = await buildAuthorizationUrl({
          providerId,
          intent: 'bind',
          userId: request.user!.userId,
          requestOrigin: requestOrigin(request),
        });
        return { authorizeUrl: url, callbackUrl, redirectUrl: callbackUrl };
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    },
  );

  app.get('/:providerId/callback', async (request: FastifyRequest, reply: FastifyReply) => {
    const { providerId } = request.params as { providerId: string };
    return processOAuthHttpCallback(providerId, request, reply);
  });

  app.post('/exchange-ticket', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { ticket?: string };
    if (!body?.ticket) {
      return reply.status(400).send({ error: '缺少 ticket' });
    }
    try {
      const session = await exchangeOAuthTicket(body.ticket);
      reply.setCookie('refresh_token', session.refreshToken, COOKIE_OPTIONS);
      return {
        accessToken: session.accessToken,
        user: session.user,
      };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post('/:providerId/register', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { pendingToken?: string; code?: string; inviteCode?: string };
    const inviteCode = body?.inviteCode || body?.code;
    if (!body?.pendingToken || !inviteCode) {
      return reply.status(400).send({ error: '缺少必要字段: pendingToken, inviteCode' });
    }
    try {
      const result = await registerWithOAuth(
        body.pendingToken,
        inviteCode,
        request.headers['user-agent'],
      );
      reply.setCookie('refresh_token', result.refreshToken, COOKIE_OPTIONS);
      return {
        accessToken: result.accessToken,
        user: result.user,
      };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.delete(
    '/unbind/:providerId',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { providerId } = request.params as { providerId: string };
      try {
        return await unbindOAuthFromAccount(request.user!.userId, providerId);
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    },
  );

  app.get('/bindings', { preHandler: [authenticate] }, async (request: FastifyRequest) => {
    const bindings = await getUserBindings(request.user!.userId);
    return { bindings };
  });
}
