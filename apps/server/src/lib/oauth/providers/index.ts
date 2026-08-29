export interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
  /** 授权端点（可选，可由 Well-Known 发现） */
  authorizeUrl?: string;
  /** Token 端点（可选） */
  tokenUrl?: string;
  /** 用户信息端点（可选） */
  userInfoUrl?: string;
  /** OIDC Issuer（兼容旧配置） */
  issuer?: string;
  /**
   * Well-Known 完整 URL
   * 例：https://idp.example.com/realms/x/.well-known/openid-configuration
   */
  wellKnownUrl?: string;
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
  defaultScope?: string;
  getAuthorizationUrl(config: OAuthProviderConfig, state: string, redirectUri: string): string;
  handleCallback(config: OAuthProviderConfig, code: string, redirectUri: string): Promise<OAuthUserInfo>;
  /** OIDC 等需要预解析 discovery 时实现 */
  prepareConfig?(config: OAuthProviderConfig): Promise<OAuthProviderConfig>;
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
