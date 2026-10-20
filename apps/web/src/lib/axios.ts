import axios from 'axios';
import router from '@/router';

let accessToken: string | null = sessionStorage.getItem('dmhub_token');

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (token) {
    sessionStorage.setItem('dmhub_token', token);
  } else {
    sessionStorage.removeItem('dmhub_token');
  }
}

export function getAccessToken() {
  return accessToken;
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

let refreshPromise: Promise<string> | null = null;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      const isTwoFARequest = originalRequest.headers?.['X-2FA-Auth'];
      const onTwoFAPage = router.currentRoute.value.path === '/2fa/verify';
      // 登录 / 注册返回 401 表示凭据错误，不是访问令牌过期。
      // 此时若浏览器还留着上一个会话的刷新 cookie，刷新只会把旧用户重新登回来。
      const isAuthEntryRequest = /^\/auth\/(login|register)(\?|$)/.test(originalRequest.url ?? '');

      if (isTwoFARequest || onTwoFAPage || isAuthEntryRequest) {
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      if (!refreshPromise) {
        refreshPromise = (async () => {
          try {
            const { data } = await axios.post('/api/auth/refresh', null, {
              withCredentials: true,
            });
            setAccessToken(data.accessToken);
            // 刷新成功，清除整页重试标记
            sessionStorage.removeItem('dmhub_refresh_retried');
            return data.accessToken;
          } finally {
            refreshPromise = null;
          }
        })();
      }

      try {
        const newToken = await refreshPromise;
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch {
        // 刷新失败可能源于多标签页下的刷新令牌轮换竞态（先到先得，后到的失败）。
        // 此时浏览器 cookie 往往已被其他标签页更新为最新令牌，整页重载后再试一次；
        // 仅当重载后仍失败时才真正登出。
        if (!sessionStorage.getItem('dmhub_refresh_retried')) {
          sessionStorage.setItem('dmhub_refresh_retried', '1');
          window.location.reload();
          // 挂起当前请求，页面即将重载
          return new Promise(() => {});
        }
        sessionStorage.removeItem('dmhub_refresh_retried');
        setAccessToken(null);
        const { useAuthStore } = await import('@/stores/auth');
        useAuthStore().clearAuth();
        const target = router.currentRoute.value.path.startsWith('/setup') ? '/setup' : '/login';
        if (router.currentRoute.value.path !== target) {
          router.push(target);
        }
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  },
);

export default api;
