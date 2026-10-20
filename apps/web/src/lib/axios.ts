import axios from 'axios';
import router from '@/router';
import {
  ACCESS_TOKEN_REFRESH_SKEW_MS,
  getTokenExpiry,
  markTransientRefreshFailure,
  needsRefresh,
  refreshWithRetry,
  SessionExpiredError,
} from '@/lib/token';

let accessToken: string | null = sessionStorage.getItem('dmhub_token');

export { ACCESS_TOKEN_REFRESH_SKEW_MS, getTokenExpiry, markTransientRefreshFailure, needsRefresh, SessionExpiredError };

/** 刷新重试退避序列（毫秒），第一项表示立即尝试 */
const REFRESH_RETRY_DELAYS_MS = [0, 400, 1200];

/** 主动刷新遇到临时故障后的重试间隔（毫秒） */
const PROACTIVE_RETRY_DELAY_MS = 30_000;

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (token) {
    sessionStorage.setItem('dmhub_token', token);
  } else {
    sessionStorage.removeItem('dmhub_token');
  }
  scheduleProactiveRefresh();
}

export function getAccessToken() {
  return accessToken;
}

async function performRefresh(): Promise<string> {
  return refreshWithRetry(async () => {
    const { data } = await axios.post('/api/auth/refresh', null, {
      withCredentials: true,
    });
    setAccessToken(data.accessToken);
    await syncAuthStoreToken(data.accessToken);
    return data.accessToken;
  }, REFRESH_RETRY_DELAYS_MS);
}

let refreshPromise: Promise<string> | null = null;

/**
 * 刷新访问令牌（并发调用共享同一次刷新）。
 * - 成功：返回新的 access token
 * - 会话失效：抛出 {@link SessionExpiredError}
 * - 临时故障：抛出原始错误，调用方不应因此登出
 */
export function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null;
    });
    // 兜底：调用方未必立即 await，避免出现 unhandledrejection 噪音
    refreshPromise.catch(() => {});
  }
  return refreshPromise;
}

/** 把刷新后的令牌同步到 auth store，保持界面状态一致 */
async function syncAuthStoreToken(token: string) {
  try {
    const { useAuthStore } = await import('@/stores/auth');
    useAuthStore().setAccessToken(token);
  } catch {
    /* store 尚未初始化时忽略 */
  }
}

let proactiveTimer: ReturnType<typeof setTimeout> | null = null;

function clearProactiveTimer() {
  if (proactiveTimer) {
    clearTimeout(proactiveTimer);
    proactiveTimer = null;
  }
}

/**
 * 排程下一次主动刷新。
 *
 * 标签页切到后台后，浏览器会节流甚至冻结定时器，主动刷新可能迟迟不执行；
 * 等用户回到前台时由 visibilitychange 兜底补刷，保证令牌不会在后台悄悄过期。
 */
function scheduleProactiveRefresh() {
  clearProactiveTimer();
  if (!accessToken) return;
  const expiry = getTokenExpiry(accessToken);
  if (expiry === null) return;
  const delay = Math.max(0, expiry - Date.now() - ACCESS_TOKEN_REFRESH_SKEW_MS);
  proactiveTimer = setTimeout(runProactiveRefresh, delay);
}

async function runProactiveRefresh() {
  proactiveTimer = null;
  try {
    // 成功后 setAccessToken 会重新排程下一轮
    await refreshAccessToken();
  } catch (err) {
    if (err instanceof SessionExpiredError) {
      await expireSession();
      return;
    }
    // 临时故障：稍后重试，登录态保持不变
    proactiveTimer = setTimeout(() => scheduleProactiveRefresh(), PROACTIVE_RETRY_DELAY_MS);
  }
}

/** 清除登录态并跳转到登录页 */
export async function expireSession() {
  setAccessToken(null);
  try {
    const { useAuthStore } = await import('@/stores/auth');
    useAuthStore().clearAuth();
  } catch {
    /* ignore */
  }
  const current = router.currentRoute.value.path;
  const target = current.startsWith('/setup') ? '/setup' : '/login';
  if (current !== target) {
    router.push(target);
  }
}

/**
 * 标签页从后台恢复到前台时，若令牌已过期或即将过期则立刻补一次刷新。
 * 后台标签页的定时器会被浏览器节流/冻结，只有回到前台才能确定令牌状态。
 */
function handleVisibilityChange() {
  if (document.visibilityState !== 'visible') return;
  const token = getAccessToken();
  if (!token) return;
  if (!needsRefresh(token)) return;
  refreshAccessToken().catch(async (err) => {
    if (err instanceof SessionExpiredError) {
      await expireSession();
    }
    // 其余失败由主动刷新定时器与请求拦截器兜底
  });
}

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      const isTwoFARequest = originalRequest.headers?.['X-2FA-Auth'];
      const onTwoFAPage = router.currentRoute.value.path === '/2fa/verify';

      if (isTwoFARequest || onTwoFAPage) {
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      try {
        const newToken = await refreshAccessToken();
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (err) {
        if (err instanceof SessionExpiredError) {
          await expireSession();
        } else {
          // 临时故障：给原始 401 打标记，调用方不要把它当作会话失效
          markTransientRefreshFailure(error);
        }
        // 临时故障不登出：保留登录态，等后续请求或主动刷新恢复
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  },
);

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', handleVisibilityChange);
  // 页面重新加载后按剩余有效期恢复排程
  scheduleProactiveRefresh();
}

export default api;
