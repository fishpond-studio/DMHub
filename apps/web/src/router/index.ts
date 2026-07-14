import { createRouter, createWebHistory } from 'vue-router';
import api, { getAccessToken, setAccessToken } from '@/lib/axios';
import axios from 'axios';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'landing',
      component: () => import('@/views/LandingView.vue'),
    },
    {
      path: '/dashboard',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/views/RegisterView.vue'),
    },
    {
      path: '/2fa/verify',
      name: '2fa-verify',
      component: () => import('@/views/TwoFactorVerifyView.vue'),
    },
    {
      path: '/setup',
      name: 'setup',
      component: () => import('@/views/setup/SetupView.vue'),
    },
    {
      path: '/settings',
      component: () => import('@/components/SettingsLayout.vue'),
      children: [
        { path: '', redirect: '/settings/team' },
        { path: '2fa', name: 'settings-2fa', component: () => import('@/views/settings/TwoFactorView.vue') },
        { path: 'team', name: 'settings-team', component: () => import('@/views/settings/TeamSettingsView.vue') },
        { path: 'invite-codes', name: 'settings-invite-codes', component: () => import('@/views/settings/InviteCodesView.vue') },
        { path: 'members', name: 'settings-members', component: () => import('@/views/settings/MembersView.vue') },
        { path: 'domain-assignments', name: 'settings-domain-assignments', component: () => import('@/views/settings/DomainAssignmentsView.vue') },
        { path: 'providers', name: 'settings-providers', component: () => import('@/views/settings/ProviderConfigView.vue') },
        { path: 'assignment-approval', name: 'settings-assignment-approval', component: () => import('@/views/settings/AssignmentApprovalView.vue') },
        { path: 'notifications', name: 'settings-notifications', component: () => import('@/views/settings/NotificationConfigView.vue') },
        { path: 'oauth-providers', name: 'settings-oauth-providers', component: () => import('@/views/settings/OAuthProviderView.vue') },
        { path: 'account-binding', name: 'settings-account-binding', component: () => import('@/views/settings/AccountBindingView.vue') },
        { path: 'admin-reset-requests', name: 'settings-admin-reset-requests', component: () => import('@/views/settings/AdminResetRequestsView.vue') },
        { path: 'api-keys', name: 'settings-api-keys', component: () => import('@/views/settings/ApiKeysView.vue') },
        { path: 'profile', name: 'settings-profile', component: () => import('@/views/settings/ProfileView.vue') },
        { path: 'user-tokens', name: 'settings-user-tokens', component: () => import('@/views/settings/UserTokensView.vue') },
      ],
    },
    {
      path: '/oauth/callback',
      name: 'oauth-callback',
      component: () => import('@/views/OAuthCallbackView.vue'),
    },
    {
      path: '/assignment-request',
      name: 'assignment-request',
      component: () => import('@/views/AssignmentRequestView.vue'),
    },
    {
      path: '/my-domains',
      name: 'my-domains',
      component: () => import('@/views/MyDomainsView.vue'),
    },
    {
      path: '/domains',
      name: 'domains',
      component: () => import('@/views/DomainsView.vue'),
    },
    {
      path: '/domains/:id',
      name: 'domain-detail',
      component: () => import('@/views/DomainDetailView.vue'),
    },
    {
      path: '/import',
      name: 'import',
      component: () => import('@/views/ImportView.vue'),
    },
    {
      path: '/logs',
      name: 'operation-logs',
      component: () => import('@/views/OperationLogsView.vue'),
    },
  ],
});

let setupStatusChecked = false;
let isInitialized = false;

export function setInitialized(value: boolean) {
  isInitialized = value;
  setupStatusChecked = true;
}

const publicRoutes = new Set(['landing', 'login', 'register', '2fa-verify', 'setup', 'oauth-callback']);

let refreshingPromise: Promise<void> | null = null;

router.beforeEach(async (to) => {
  if (!setupStatusChecked) {
    try {
      const { data } = await api.get('/setup/status');
      isInitialized = data.initialized ?? false;
    } catch {
      isInitialized = false;
    }
    setupStatusChecked = true;
  }

  if (!isInitialized && to.name !== 'setup') {
    return { name: 'setup' };
  }

  if (isInitialized && to.name === 'setup') {
    return { name: 'landing' };
  }

  if (isInitialized && !publicRoutes.has(to.name as string) && !getAccessToken()) {
    if (!refreshingPromise) {
      refreshingPromise = (async () => {
        try {
          const { data } = await axios.post('/api/auth/refresh', null, { withCredentials: true });
          setAccessToken(data.accessToken);
          const { useAuthStore } = await import('@/stores/auth');
          const authStore = useAuthStore();
          authStore.token = data.accessToken;
          await authStore.fetchUser();
        } catch {
          const { useAuthStore } = await import('@/stores/auth');
          useAuthStore().clearAuth();
        } finally {
          refreshingPromise = null;
        }
      })();
    }
    await refreshingPromise;
    if (!getAccessToken() && to.name !== 'login') {
      return { name: 'login' };
    }
  }

  return true;
});

router.onError((error, to) => {
  console.error('[Router] Navigation failed:', error, 'to:', to.path);
});

export default router;
