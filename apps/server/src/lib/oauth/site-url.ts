import { eq } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { teamSettings } from '../../db/schema.js';
import { readSetupState } from '../setup-state.js';

/**
 * 解析站点根 URL，用于构造 OAuth 回调绝对地址。
 * 优先 team_settings.site_url，其次 setup state，最后回退请求头。
 */
export async function resolveSiteBaseUrl(requestOrigin?: string): Promise<string> {
  try {
    const db = getDb();
    const [row] = await db
      .select({ siteUrl: teamSettings.siteUrl })
      .from(teamSettings)
      .where(eq(teamSettings.id, 1))
      .limit(1);
    if (row?.siteUrl) {
      return row.siteUrl.replace(/\/+$/, '');
    }
  } catch {
    // db not ready
  }

  const state = readSetupState();
  if (state.siteUrl) {
    return state.siteUrl.replace(/\/+$/, '');
  }

  if (requestOrigin) {
    return requestOrigin.replace(/\/+$/, '');
  }

  throw new Error(
    '站点 URL 未配置。请在「设置 → 团队设置」中填写站点 URL（用于 OAuth/OIDC 回调地址）。',
  );
}

/**
 * OIDC / 自定义 OIDC 使用简洁固定回调：{site}/oauth/oidc
 * 其他 OAuth 提供商：{site}/api/auth/oauth/{providerId}/callback
 */
export function buildOAuthCallbackUrl(siteBase: string, providerId: string): string {
  const base = siteBase.replace(/\/+$/, '');
  if (providerId === 'oidc' || providerId === 'custom') {
    return `${base}/oauth/oidc`;
  }
  return `${base}/api/auth/oauth/${encodeURIComponent(providerId)}/callback`;
}

/** 主页 URL（登记到 IdP 的 Homepage / Application URL） */
export function buildOAuthHomepageUrl(siteBase: string): string {
  return siteBase.replace(/\/+$/, '');
}

export function buildFrontendUrl(siteBase: string, path: string): string {
  const base = siteBase.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

export function isOidcProviderId(providerId: string): boolean {
  return providerId === 'oidc' || providerId === 'custom';
}
