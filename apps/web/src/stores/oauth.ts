import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '@/lib/axios';

export interface OAuthProviderInfo {
  providerId: string;
  name: string;
  type: 'oauth2' | 'oidc';
}

export interface OAuthProviderConfig {
  id: string;
  providerId: string;
  enabled: boolean;
  clientIdMasked: string;
  scope: string | null;
  customAuthorizeUrl: string | null;
  customTokenUrl: string | null;
  customUserInfoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AvailableProvider {
  id: string;
  name: string;
  type: 'oauth2' | 'oidc';
}

export interface OAuthBinding {
  id: string;
  providerId: string;
  providerEmail: string | null;
  providerName: string | null;
  providerAvatar: string | null;
  providerDisplayName: string;
  createdAt: string;
}

export const useOAuthStore = defineStore('oauth', () => {
  const providers = ref<OAuthProviderInfo[]>([]);
  const loading = ref(false);

  async function fetchProviders() {
    loading.value = true;
    try {
      const { data } = await api.get('/auth/oauth/providers');
      providers.value = data.providers;
    } finally {
      loading.value = false;
    }
  }

  function getAuthorizeUrl(providerId: string): string {
    return `/api/auth/oauth/${providerId}/authorize`;
  }

  return { providers, loading, fetchProviders, getAuthorizeUrl };
});
