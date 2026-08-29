import type { OAuthProvider, OAuthProviderConfig, OAuthUserInfo } from './index.js';
import { registerProvider } from './index.js';

class GitLabOAuthProvider implements OAuthProvider {
  id = 'gitlab';
  name = 'GitLab';
  type = 'oauth2' as const;

  private readonly DEFAULT_AUTHORIZE_URL = 'https://gitlab.com/oauth/authorize';
  private readonly DEFAULT_TOKEN_URL = 'https://gitlab.com/oauth/token';
  private readonly DEFAULT_USER_INFO_URL = 'https://gitlab.com/api/v4/user';
  private readonly DEFAULT_SCOPE = 'read_user';

  getAuthorizationUrl(config: OAuthProviderConfig, state: string, redirectUri: string): string {
    const url = new URL(config.authorizeUrl || this.DEFAULT_AUTHORIZE_URL);
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', config.scope || this.DEFAULT_SCOPE);
    url.searchParams.set('state', state);
    url.searchParams.set('response_type', 'code');
    return url.toString();
  }

  async handleCallback(config: OAuthProviderConfig, code: string, redirectUri: string): Promise<OAuthUserInfo> {
    if (!redirectUri) {
      throw new Error('GitLab OAuth 缺少 redirect_uri');
    }
    const tokenUrl = config.tokenUrl || this.DEFAULT_TOKEN_URL;

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResponse.json() as { access_token?: string; error?: string; error_description?: string };
    if (!tokenResponse.ok || tokenData.error || !tokenData.access_token) {
      throw new Error(tokenData.error_description || tokenData.error || `GitLab token 交换失败 (HTTP ${tokenResponse.status})`);
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
      throw new Error('Failed to fetch GitLab user info');
    }

    const userData = await userResponse.json() as {
      id: number;
      username: string;
      email: string | null;
      name: string | null;
      avatar_url: string;
      [key: string]: unknown;
    };

    return {
      providerId: this.id,
      providerUserId: String(userData.id),
      email: userData.email || undefined,
      name: userData.name || userData.username,
      avatar: userData.avatar_url || undefined,
      raw: userData as unknown as Record<string, unknown>,
    };
  }
}

const gitlabProvider = new GitLabOAuthProvider();
registerProvider(gitlabProvider);

export { GitLabOAuthProvider };
