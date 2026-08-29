import type { OAuthProvider, OAuthProviderConfig, OAuthUserInfo } from './index.js';
import { registerProvider } from './index.js';

class GoogleOAuthProvider implements OAuthProvider {
  id = 'google';
  name = 'Google';
  type = 'oidc' as const;

  private readonly DEFAULT_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
  private readonly DEFAULT_TOKEN_URL = 'https://oauth2.googleapis.com/token';
  private readonly DEFAULT_USER_INFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
  private readonly DEFAULT_SCOPE = 'openid email profile';

  getAuthorizationUrl(config: OAuthProviderConfig, state: string, redirectUri: string): string {
    const url = new URL(config.authorizeUrl || this.DEFAULT_AUTHORIZE_URL);
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', config.scope || this.DEFAULT_SCOPE);
    url.searchParams.set('state', state);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    return url.toString();
  }

  async handleCallback(config: OAuthProviderConfig, code: string, redirectUri: string): Promise<OAuthUserInfo> {
    if (!redirectUri) {
      throw new Error('Google OAuth 缺少 redirect_uri');
    }
    const tokenUrl = config.tokenUrl || this.DEFAULT_TOKEN_URL;

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

    const tokenData = await tokenResponse.json() as { access_token?: string; error?: string; error_description?: string };
    if (!tokenResponse.ok || tokenData.error || !tokenData.access_token) {
      throw new Error(tokenData.error_description || tokenData.error || `Google token 交换失败 (HTTP ${tokenResponse.status})`);
    }

    const accessToken = tokenData.access_token;

    const userInfoUrl = config.userInfoUrl || this.DEFAULT_USER_INFO_URL;
    const userResponse = await fetch(userInfoUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!userResponse.ok) {
      throw new Error('Failed to fetch Google user info');
    }

    const userData = await userResponse.json() as {
      id: string;
      name: string;
      email: string;
      picture: string;
      [key: string]: unknown;
    };

    return {
      providerId: this.id,
      providerUserId: String(userData.id),
      email: userData.email || undefined,
      name: userData.name || undefined,
      avatar: userData.picture || undefined,
      raw: userData as unknown as Record<string, unknown>,
    };
  }
}

const googleProvider = new GoogleOAuthProvider();
registerProvider(googleProvider);

export { GoogleOAuthProvider };
