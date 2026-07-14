import type { OAuthProvider, OAuthProviderConfig, OAuthUserInfo } from './index.js';
import { registerProvider } from './index.js';

class FeishuOAuthProvider implements OAuthProvider {
  id = 'feishu';
  name = 'Feishu';
  type = 'oauth2' as const;

  private readonly DEFAULT_AUTHORIZE_URL = 'https://open.feishu.cn/open-apis/authen/v1/authorize';
  private readonly DEFAULT_TOKEN_URL = 'https://open.feishu.cn/open-apis/authen/v1/oidc/access_token';
  private readonly DEFAULT_USER_INFO_URL = 'https://open.feishu.cn/open-apis/authen/v1/user_info';
  private readonly APP_ACCESS_TOKEN_URL = 'https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal';
  private readonly DEFAULT_SCOPE = 'openid';

  getAuthorizationUrl(config: OAuthProviderConfig, state: string, redirectUri: string): string {
    const url = new URL(config.authorizeUrl || this.DEFAULT_AUTHORIZE_URL);
    url.searchParams.set('app_id', config.clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', config.scope || this.DEFAULT_SCOPE);
    url.searchParams.set('state', state);
    url.searchParams.set('response_type', 'code');
    return url.toString();
  }

  private async getAppAccessToken(config: OAuthProviderConfig): Promise<string> {
    const response = await fetch(this.APP_ACCESS_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        app_id: config.clientId,
        app_secret: config.clientSecret,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to obtain Feishu app_access_token');
    }

    const data = await response.json() as { app_access_token?: string; code?: number; msg?: string };
    if (data.code && data.code !== 0) {
      throw new Error(data.msg || 'Failed to obtain Feishu app_access_token');
    }
    if (!data.app_access_token) {
      throw new Error('Failed to obtain Feishu app_access_token');
    }
    return data.app_access_token;
  }

  async handleCallback(config: OAuthProviderConfig, code: string, _redirectUri: string): Promise<OAuthUserInfo> {
    const appAccessToken = await this.getAppAccessToken(config);

    const tokenUrl = config.tokenUrl || this.DEFAULT_TOKEN_URL;
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${appAccessToken}`,
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error('Feishu token exchange failed');
    }

    const tokenData = await tokenResponse.json() as {
      data?: { access_token?: string };
      code?: number;
      msg?: string;
    };

    if (tokenData.code && tokenData.code !== 0) {
      throw new Error(tokenData.msg || 'Failed to obtain access token from Feishu');
    }

    const accessToken = tokenData.data?.access_token;
    if (!accessToken) {
      throw new Error('Failed to obtain access token from Feishu');
    }

    const userInfoUrl = config.userInfoUrl || this.DEFAULT_USER_INFO_URL;
    const userResponse = await fetch(userInfoUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!userResponse.ok) {
      throw new Error('Failed to fetch Feishu user info');
    }

    const userResult = await userResponse.json() as {
      data?: {
        open_id: string;
        name: string;
        email: string;
        avatar_url: string;
        [key: string]: unknown;
      };
      code?: number;
      msg?: string;
    };

    if (userResult.code && userResult.code !== 0) {
      throw new Error(userResult.msg || 'Failed to fetch Feishu user info');
    }

    const userData = userResult.data;
    if (!userData) {
      throw new Error('Failed to fetch Feishu user info');
    }

    return {
      providerId: this.id,
      providerUserId: userData.open_id,
      email: userData.email || undefined,
      name: userData.name || undefined,
      avatar: userData.avatar_url || undefined,
      raw: userData as unknown as Record<string, unknown>,
    };
  }
}

const feishuProvider = new FeishuOAuthProvider();
registerProvider(feishuProvider);

export { FeishuOAuthProvider };
