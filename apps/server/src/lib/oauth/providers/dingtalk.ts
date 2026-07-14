import type { OAuthProvider, OAuthProviderConfig, OAuthUserInfo } from './index.js';
import { registerProvider } from './index.js';

class DingTalkOAuthProvider implements OAuthProvider {
  id = 'dingtalk';
  name = 'DingTalk';
  type = 'oauth2' as const;

  private readonly DEFAULT_AUTHORIZE_URL = 'https://login.dingtalk.com/oauth2/auth';
  private readonly DEFAULT_TOKEN_URL = 'https://api.dingtalk.com/v1.0/oauth2/userAccessToken';
  private readonly DEFAULT_USER_INFO_URL = 'https://api.dingtalk.com/v1.0/contact/users/me';
  private readonly DEFAULT_SCOPE = 'openid';

  getAuthorizationUrl(config: OAuthProviderConfig, state: string, redirectUri: string): string {
    const url = new URL(config.authorizeUrl || this.DEFAULT_AUTHORIZE_URL);
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', config.scope || this.DEFAULT_SCOPE);
    url.searchParams.set('state', state);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('prompt', 'consent');
    return url.toString();
  }

  async handleCallback(config: OAuthProviderConfig, code: string, _redirectUri: string): Promise<OAuthUserInfo> {
    const tokenUrl = config.tokenUrl || this.DEFAULT_TOKEN_URL;

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        code,
        grantType: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error('DingTalk token exchange failed');
    }

    const tokenData = await tokenResponse.json() as { accessToken?: string; error?: string; message?: string };
    if (tokenData.error || !tokenData.accessToken) {
      throw new Error(tokenData.message || tokenData.error || 'Failed to obtain access token from DingTalk');
    }

    const accessToken = tokenData.accessToken;

    const userInfoUrl = config.userInfoUrl || this.DEFAULT_USER_INFO_URL;
    const userResponse = await fetch(userInfoUrl, {
      headers: {
        'x-acs-dingtalk-access-token': accessToken,
        Accept: 'application/json',
      },
    });

    if (!userResponse.ok) {
      throw new Error('Failed to fetch DingTalk user info');
    }

    const userData = await userResponse.json() as {
      unionId: string;
      openId: string;
      nick: string;
      email: string;
      avatarUrl: string;
      mobile: string;
      [key: string]: unknown;
    };

    return {
      providerId: this.id,
      providerUserId: userData.unionId || userData.openId,
      email: userData.email || undefined,
      name: userData.nick || undefined,
      avatar: userData.avatarUrl || undefined,
      raw: userData as unknown as Record<string, unknown>,
    };
  }
}

const dingtalkProvider = new DingTalkOAuthProvider();
registerProvider(dingtalkProvider);

export { DingTalkOAuthProvider };
