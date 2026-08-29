import { defineStore } from 'pinia';
import { ref } from 'vue';
import api, { setAccessToken as setApiToken } from '@/lib/axios';
import { startAuthentication } from '@simplewebauthn/browser';

export const useAuthStore = defineStore('auth', () => {
  const savedToken = sessionStorage.getItem('dmhub_token');
  const token = ref<string | null>(savedToken);
  const user = ref<{
    id: string;
    username: string;
    email: string | null;
    role: string;
    displayName?: string | null;
    nickname?: string | null;
    avatarUrl?: string | null;
    emailVerified?: boolean;
    notificationsEnabled?: boolean;
    emailNotificationsEnabled?: boolean;
  } | null>(null);

  function setAccessToken(newToken: string) {
    token.value = newToken;
    setApiToken(newToken);
  }

  function clearAuth() {
    token.value = null;
    user.value = null;
    setApiToken(null);
  }

  async function login(username: string, password: string, rememberMe = false) {
    const { data } = await api.post('/auth/login', { username, password, rememberMe });
    if (data.requires2FA) {
      return { requires2FA: true as const, tempToken: data.tempToken };
    }
    setAccessToken(data.accessToken);
    user.value = data.user;
    return { requires2FA: false as const };
  }

  async function register(input: {
    username: string;
    email?: string;
    password: string;
    confirmPassword: string;
    inviteCode: string;
  }) {
    await api.post('/auth/register', input);
  }

  async function logout() {
    try {
      await api.post('/auth/logout', null, { withCredentials: true });
    } finally {
      clearAuth();
    }
  }

  async function fetchUser() {
    try {
      const { data } = await api.get('/auth/me');
      user.value = data.user;
    } catch {
      clearAuth();
    }
  }

  async function verify2FA(tempToken: string, method: 'totp' | 'backup' | 'email', code: string) {
    const { data } = await api.post('/2fa/verify', { method, code }, {
      headers: { Authorization: `Bearer ${tempToken}`, 'X-2FA-Auth': 'true' },
    });
    setAccessToken(data.accessToken);
    user.value = data.user;
    return { backupCodesWarning: data.backupCodesWarning };
  }

  async function verify2FAPasskey(tempToken: string) {
    const { data: options } = await api.post('/2fa/passkey/auth-options', null, {
      headers: { Authorization: `Bearer ${tempToken}`, 'X-2FA-Auth': 'true' },
    });
    const credential = await startAuthentication({ optionsJSON: options });
    const { data } = await api.post('/2fa/passkey/auth-verify', { response: credential }, {
      headers: { Authorization: `Bearer ${tempToken}`, 'X-2FA-Auth': 'true' },
    });
    setAccessToken(data.accessToken);
    user.value = data.user;
    return { backupCodesWarning: data.backupCodesWarning };
  }

  return { token, user, setAccessToken, clearAuth, login, register, logout, fetchUser, verify2FA, verify2FAPasskey };
});
