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

      if (isTwoFARequest || onTwoFAPage) {
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
