import type { OAuthProvider, OAuthProviderConfig, OAuthUserInfo } from './index.js';
import { registerProvider } from './index.js';

class GitHubOAuthProvider implements OAuthProvider {
  id = 'github';
  name = 'GitHub';
  type = 'oauth2' as const;

  private readonly DEFAULT_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
  private readonly DEFAULT_TOKEN_URL = 'https://github.com/login/oauth/access_token';
  private readonly DEFAULT_USER_INFO_URL = 'https://api.github.com/user';
  private readonly DEFAULT_EMAIL_URL = 'https://api.github.com/user/emails';
  private readonly DEFAULT_SCOPE = 'user:email';

  getAuthorizationUrl(config: OAuthProviderConfig, state: string, redirectUri: string): string {
    const url = new URL(config.authorizeUrl || this.DEFAULT_AUTHORIZE_URL);
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', config.scope || this.DEFAULT_SCOPE);
    url.searchParams.set('state', state);
    return url.toString();
  }

  async handleCallback(config: OAuthProviderConfig, code: string, redirectUri: string): Promise<OAuthUserInfo> {
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
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error('GitHub token exchange failed');
    }

    const tokenData = await tokenResponse.json() as { access_token?: string; error?: string; error_description?: string };
    if (tokenData.error || !tokenData.access_token) {
      throw new Error(tokenData.error_description || tokenData.error || 'Failed to obtain access token from GitHub');
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
      throw new Error('Failed to fetch GitHub user info');
    }

    const userData = await userResponse.json() as {
      id: number;
      login: string;
      email: string | null;
      name: string | null;
      avatar_url: string;
      [key: string]: unknown;
    };

    let email: string | undefined = userData.email || undefined;
    if (!email) {
      email = await this.fetchPrivateEmail(accessToken);
    }

    return {
      providerId: this.id,
      providerUserId: String(userData.id),
      email: email,
      name: userData.name || userData.login,
      avatar: userData.avatar_url,
      raw: userData as unknown as Record<string, unknown>,
    };
  }

  private async fetchPrivateEmail(accessToken: string): Promise<string | undefined> {
    try {
      const response = await fetch(this.DEFAULT_EMAIL_URL, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      });
      if (!response.ok) return undefined;
      const emails = await response.json() as Array<{ email: string; primary: boolean; verified: boolean }>;
      const primary = emails.find((e: { email: string; primary: boolean; verified: boolean }) => e.primary && e.verified);
      if (primary) return primary.email;
      const verified = emails.find((e: { email: string; primary: boolean; verified: boolean }) => e.verified);
      return verified?.email;
    } catch {
      return undefined;
    }
  }
}

const githubProvider = new GitHubOAuthProvider();
registerProvider(githubProvider);

export { GitHubOAuthProvider };
