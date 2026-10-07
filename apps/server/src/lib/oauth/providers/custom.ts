import type { OAuthProvider, OAuthProviderConfig, OAuthUserInfo } from './index.js';
import { registerProvider } from './index.js';
import { isPublicDomain, safeFetch } from '../../ssrf-guard.js';

interface OIDCDiscovery {
  issuer?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  userinfo_endpoint?: string;
  jwks_uri?: string;
  [key: string]: unknown;
}

const discoveryCache = new Map<string, { data: OIDCDiscovery; at: number }>();
const DISCOVERY_TTL_MS = 60 * 60 * 1000;

async function assertPublicUrl(urlStr: string, label: string) {
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    throw new Error(`无效的 ${label}: ${urlStr}`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`${label} 仅支持 http/https`);
  }
  const safe = await isPublicDomain(url.hostname);
  if (!safe && process.env.NODE_ENV === 'production') {
    throw new Error(`SSRF 拦截：${label} 主机不可达公网: ${url.hostname}`);
  }
}

/**
 * OIDC discovery 请求。
 *
 * 生产环境走 safeFetch，30x 按 Fetch 规范跟随并逐跳校验，不会把 POST body 重放出去。
 * 非生产环境保留内网 IdP 联调能力（与 assertPublicUrl 的环境判定保持一致）。
 */
const oidcFetch: (urlStr: string, init?: RequestInit) => Promise<Response> =
  process.env.NODE_ENV === 'production'
    ? (urlStr, init) => safeFetch(urlStr, init)
    : (urlStr, init) => fetch(urlStr, init);

/**
 * token / userinfo 携带 client_secret 或 Bearer，不允许跟随重定向。
 */
const oidcFetchNoRedirect: (urlStr: string, init?: RequestInit) => Promise<Response> =
  process.env.NODE_ENV === 'production'
    ? (urlStr, init) => safeFetch(urlStr, init, 0)
    : (urlStr, init) => fetch(urlStr, { ...init, redirect: 'error' });

/**
 * 从完整 Well-Known URL 拉取 discovery 文档。
 * 也支持只填 Issuer：自动补 /.well-known/openid-configuration
 */
export async function fetchOidcDiscovery(wellKnownOrIssuer: string): Promise<OIDCDiscovery> {
  const input = wellKnownOrIssuer.trim().replace(/\/+$/, '');
  const cached = discoveryCache.get(input);
  if (cached && Date.now() - cached.at < DISCOVERY_TTL_MS) {
    return cached.data;
  }

  await assertPublicUrl(input, 'Well-Known / Issuer URL');

  let discoveryUrl = input;
  if (!/openid-configuration|oauth-authorization-server/i.test(input)) {
    discoveryUrl = `${input}/.well-known/openid-configuration`;
  }

  const response = await oidcFetch(discoveryUrl, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(
      `OIDC Well-Known 拉取失败 (HTTP ${response.status})：${discoveryUrl}。请检查 URL，或手动填写授权/Token/用户信息端点。`,
    );
  }

  const discovery = (await response.json()) as OIDCDiscovery;
  if (!discovery.authorization_endpoint || !discovery.token_endpoint) {
    throw new Error('Well-Known 响应缺少 authorization_endpoint 或 token_endpoint');
  }

  discoveryCache.set(input, { data: discovery, at: Date.now() });
  discoveryCache.set(discoveryUrl, { data: discovery, at: Date.now() });
  return discovery;
}

async function resolveEndpoints(config: OAuthProviderConfig): Promise<{
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl?: string;
}> {
  // 三个端点都手填 → 直接用
  if (config.authorizeUrl && config.tokenUrl) {
    return {
      authorizeUrl: config.authorizeUrl,
      tokenUrl: config.tokenUrl,
      userInfoUrl: config.userInfoUrl,
    };
  }

  // 需要 Well-Known / Issuer 补全缺失端点
  const wellKnown = config.wellKnownUrl || config.issuer;
  if (!wellKnown) {
    throw new Error(
      'OIDC 需要填写 Well-Known URL，或同时手动填写「授权端点」和「Token 端点」',
    );
  }

  const discovery = await fetchOidcDiscovery(wellKnown);

  return {
    authorizeUrl: config.authorizeUrl || discovery.authorization_endpoint!,
    tokenUrl: config.tokenUrl || discovery.token_endpoint!,
    userInfoUrl: config.userInfoUrl || discovery.userinfo_endpoint,
  };
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const json = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
      'utf8',
    );
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

class GenericOidcProvider implements OAuthProvider {
  defaultScope = 'openid email profile';

  constructor(
    public id: string,
    public name: string,
  ) {}

  type = 'oidc' as const;

  getAuthorizationUrl(config: OAuthProviderConfig, state: string, redirectUri: string): string {
    const authorizeUrl = config.authorizeUrl;
    if (!authorizeUrl) {
      throw new Error('OIDC 缺少授权端点，请填写 Well-Known URL 或手动指定授权端点');
    }

    const url = new URL(authorizeUrl);
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', config.scope || this.defaultScope);
    url.searchParams.set('state', state);
    url.searchParams.set('response_type', 'code');
    return url.toString();
  }

  async prepareConfig(config: OAuthProviderConfig): Promise<OAuthProviderConfig> {
    const endpoints = await resolveEndpoints(config);
    await assertPublicUrl(endpoints.authorizeUrl, '授权端点');
    await assertPublicUrl(endpoints.tokenUrl, 'Token 端点');
    if (endpoints.userInfoUrl) {
      await assertPublicUrl(endpoints.userInfoUrl, '用户信息端点');
    }
    return {
      ...config,
      authorizeUrl: endpoints.authorizeUrl,
      tokenUrl: endpoints.tokenUrl,
      userInfoUrl: endpoints.userInfoUrl,
    };
  }

  async handleCallback(
    config: OAuthProviderConfig,
    code: string,
    redirectUri: string,
  ): Promise<OAuthUserInfo> {
    const prepared = await this.prepareConfig(config);
    const tokenUrl = prepared.tokenUrl!;
    const userInfoUrl = prepared.userInfoUrl;

    if (!redirectUri) {
      throw new Error('OIDC 回调缺少 redirect_uri，无法交换令牌');
    }

    const tokenResponse = await oidcFetchNoRedirect(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });

    const tokenText = await tokenResponse.text();
    let tokenData: {
      access_token?: string;
      id_token?: string;
      error?: string;
      error_description?: string;
    };
    try {
      tokenData = JSON.parse(tokenText);
    } catch {
      throw new Error(`OIDC Token 交换失败：非 JSON 响应 (HTTP ${tokenResponse.status})`);
    }

    if (!tokenResponse.ok || tokenData.error || !tokenData.access_token) {
      throw new Error(
        tokenData.error_description ||
          tokenData.error ||
          `OIDC Token 交换失败 (HTTP ${tokenResponse.status})`,
      );
    }

    if (userInfoUrl) {
      const userResponse = await oidcFetchNoRedirect(userInfoUrl, {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: 'application/json',
        },
      });
      if (!userResponse.ok) {
        throw new Error(`获取用户信息失败 (HTTP ${userResponse.status})`);
      }
      const userData = (await userResponse.json()) as {
        sub?: string;
        name?: string;
        preferred_username?: string;
        email?: string;
        picture?: string;
        [key: string]: unknown;
      };
      if (!userData.sub) {
        throw new Error('用户信息响应缺少 sub 字段');
      }
      return {
        providerId: this.id,
        providerUserId: String(userData.sub),
        email: userData.email || undefined,
        name: userData.name || userData.preferred_username || undefined,
        avatar: userData.picture || undefined,
        raw: userData as Record<string, unknown>,
      };
    }

    if (tokenData.id_token) {
      const claims = decodeJwtPayload(tokenData.id_token);
      if (!claims?.sub) {
        throw new Error('id_token 缺少 sub，且未配置用户信息端点');
      }
      return {
        providerId: this.id,
        providerUserId: String(claims.sub),
        email: typeof claims.email === 'string' ? claims.email : undefined,
        name:
          (typeof claims.name === 'string' && claims.name) ||
          (typeof claims.preferred_username === 'string' && claims.preferred_username) ||
          undefined,
        avatar: typeof claims.picture === 'string' ? claims.picture : undefined,
        raw: claims,
      };
    }

    throw new Error('OIDC 未返回用户信息端点且无 id_token，无法获取用户身份');
  }
}

// 主 ID：oidc（推荐）
const oidcProvider = new GenericOidcProvider('oidc', 'OIDC');
registerProvider(oidcProvider);

// 兼容旧配置 provider_id = custom
const customAlias = new GenericOidcProvider('custom', '自定义 OIDC');
registerProvider(customAlias);

export { GenericOidcProvider };
