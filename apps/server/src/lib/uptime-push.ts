import { safeFetch } from './ssrf-guard.js';

export function buildUptimePushUrl(pushUrl: string, status: 'up' | 'down', message: string): URL {
  let url: URL;
  try {
    url = new URL(pushUrl);
  } catch {
    throw new Error('无效的 Push URL');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('无效的 Push URL');
  }
  if (!/\/api\/push\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname)) {
    throw new Error('请填写 Uptime Kuma 提供的完整 Push URL（包含 /api/push/<token>），不能只填写站点地址');
  }
  // The configured value is already the complete endpoint, including its token.
  url.searchParams.set('status', status);
  url.searchParams.set('msg', message);
  return url;
}

export async function sendUptimePush(pushUrl: string, status: 'up' | 'down', message: string): Promise<void> {
  const url = buildUptimePushUrl(pushUrl, status, message);
  const response = await safeFetch(url.href, { signal: AbortSignal.timeout(5000) }, 0);
  await response.body?.cancel();
}
