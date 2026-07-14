export interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
  authorizeUrl?: string;
  tokenUrl?: string;
  userInfoUrl?: string;
  scope?: string;
}

export interface OAuthUserInfo {
  providerId: string;
  providerUserId: string;
  email?: string;
  name?: string;
  avatar?: string;
  raw?: Record<string, unknown>;
}

export interface OAuthProvider {
  id: string;
  name: string;
  type: 'oauth2' | 'oidc';
  getAuthorizationUrl(config: OAuthProviderConfig, state: string, redirectUri: string): string;
  handleCallback(config: OAuthProviderConfig, code: string, redirectUri: string): Promise<OAuthUserInfo>;
}

const providers: Map<string, OAuthProvider> = new Map();

export function registerProvider(provider: OAuthProvider): void {
  providers.set(provider.id, provider);
}

export function getProvider(providerId: string): OAuthProvider | undefined {
  return providers.get(providerId);
}

export function getAllProviders(): OAuthProvider[] {
  return Array.from(providers.values());
}

export function getRegisteredProviderIds(): string[] {
  return Array.from(providers.keys());
}

export async function loadProviders(): Promise<void> {
  await import('./github.js');
  await import('./gitlab.js');
  await import('./google.js');
  await import('./dingtalk.js');
  await import('./feishu.js');
  await import('./custom.js');
}
