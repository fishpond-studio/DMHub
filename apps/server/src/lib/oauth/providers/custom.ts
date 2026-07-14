import type { OAuthProvider, OAuthProviderConfig, OAuthUserInfo } from './index.js';
import { registerProvider } from './index.js';
import { isPublicDomain } from '../../ssrf-guard.js';

interface OIDCDiscovery {
  authorization_endpoint?: string;
  token_endpoint?: string;
  userinfo_endpoint?: string;
  [key: string]: unknown;
}

const discoveryCache = new Map<string, OIDCDiscovery>();

async function discoverOIDC(issuer: string): Promise<OIDCDiscovery> {
  const cached = discoveryCache.get(issuer);
  if (cached) return cached;

  try {
    const issuerUrl = new URL(issuer);
    const safe = await isPublicDomain(issuerUrl.hostname);
    if (!safe) {
      throw new Error(`SSRF blocked: OIDC issuer resolves to private address: ${issuerUrl.hostname}`);
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('SSRF blocked')) throw err;
    throw new Error(`Invalid OIDC issuer URL: ${issuer}`);
  }

  const url = new URL('/.well-known/openid-configuration', issuer);
  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`OIDC discovery failed for issuer: ${issuer}`);
  }

  const discovery = await response.json() as OIDCDiscovery;
  discoveryCache.set(issuer, discovery);
  return discovery;
}

class CustomOIDCProvider implements OAuthProvider {
  id = 'custom';
  name = 'Custom OIDC';
  type = 'oidc' as const;

  private readonly DEFAULT_SCOPE = 'openid email profile';

  getAuthorizationUrl(config: OAuthProviderConfig, state: string, redirectUri: string): string {
    const authorizeUrl = config.authorizeUrl;
    if (!authorizeUrl) {
      throw new Error('Custom OIDC requires an authorize URL (authorizeUrl) or issuer for discovery');
    }

    const url = new URL(authorizeUrl);
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', config.scope || this.DEFAULT_SCOPE);
    url.searchParams.set('state', state);
    url.searchParams.set('response_type', 'code');
    return url.toString();
  }

  async handleCallback(config: OAuthProviderConfig, code: string, redirectUri: string): Promise<OAuthUserInfo> {
    let tokenUrl = config.tokenUrl;
    let userInfoUrl = config.userInfoUrl;

    if (!tokenUrl || !userInfoUrl) {
      const issuer = config.authorizeUrl
        ? new URL(config.authorizeUrl).origin
        : undefined;

      if (!issuer) {
        throw new Error('Custom OIDC requires tokenUrl and userInfoUrl, or a valid authorizeUrl for discovery');
      }

      const discovery = await discoverOIDC(issuer);
      if (!tokenUrl) tokenUrl = discovery.token_endpoint;
      if (!userInfoUrl) userInfoUrl = discovery.userinfo_endpoint;

      if (!tokenUrl || !userInfoUrl) {
        throw new Error('Custom OIDC: could not determine tokenUrl or userInfoUrl from discovery');
      }
    }

    const tokenResponse = await fetch(tokenUrl, {
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

    if (!tokenResponse.ok) {
      throw new Error('Custom OIDC token exchange failed');
    }

    const tokenData = await tokenResponse.json() as { access_token?: string; error?: string; error_description?: string };
    if (tokenData.error || !tokenData.access_token) {
      throw new Error(tokenData.error_description || tokenData.error || 'Failed to obtain access token from Custom OIDC');
    }

    const accessToken = tokenData.access_token;

    const userResponse = await fetch(userInfoUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!userResponse.ok) {
      throw new Error('Failed to fetch Custom OIDC user info');
    }

    const userData = await userResponse.json() as {
      sub: string;
      name?: string;
      email?: string;
      picture?: string;
      [key: string]: unknown;
    };

    return {
      providerId: this.id,
      providerUserId: userData.sub,
      email: userData.email || undefined,
      name: userData.name || undefined,
      avatar: userData.picture || undefined,
      raw: userData as unknown as Record<string, unknown>,
    };
  }
}

const customOIDCProvider = new CustomOIDCProvider();
registerProvider(customOIDCProvider);

export { CustomOIDCProvider };
