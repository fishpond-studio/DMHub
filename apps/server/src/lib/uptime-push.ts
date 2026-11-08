import { safeFetch } from './ssrf-guard.js';

export function buildUptimePushUrl(pushUrl: string, status: 'up' | 'down', message: string): URL {
  const url = new URL(pushUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
    || !/\/api\/push\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname)) {
    throw new Error('无效的 Push URL');
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
