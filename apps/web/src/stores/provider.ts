import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '@/lib/axios';

export interface ProviderConfig {
  id: string;
  providerId: string;
  name: string;
  credentials: Record<string, string>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TestResult {
  success: boolean;
  error?: string;
}

export interface SyncResult {
  syncedDomains: number;
  syncedRecords: number;
}

export const useProviderStore = defineStore('provider', () => {
  const providers = ref<ProviderConfig[]>([]);
  const loading = ref(false);

  async function fetchProviders() {
    loading.value = true;
    try {
      const { data } = await api.get('/providers');
      providers.value = data.providers;
    } finally {
      loading.value = false;
    }
  }

  async function createProvider(input: {
    name: string;
    providerId: string;
    credentials: Record<string, string>;
  }): Promise<ProviderConfig> {
    const { data } = await api.post('/providers', input);
    providers.value.push(data);
    return data;
  }

  async function updateProvider(
    id: string,
    input: { name?: string; credentials?: Record<string, string>; enabled?: boolean },
  ): Promise<ProviderConfig> {
    const { data } = await api.put(`/providers/${id}`, input);
    const idx = providers.value.findIndex((p) => p.id === id);
    if (idx !== -1) {
      providers.value[idx] = data;
    }
    return data;
  }

  async function deleteProvider(
    id: string,
    confirmed: boolean,
  ): Promise<{ success?: boolean; requiresConfirmation?: boolean; warning?: string; domainCount?: number }> {
    const { data } = await api.delete(`/providers/${id}`, {
      headers: confirmed ? { 'x-confirm-delete': 'true' } : {},
    });
    if (data.success) {
      providers.value = providers.value.filter((p) => p.id !== id);
    }
    return data;
  }

  async function testConnection(id: string): Promise<TestResult> {
    const { data } = await api.post(`/providers/${id}/test`);
    return data;
  }

  async function syncDomains(id: string): Promise<SyncResult> {
    const { data } = await api.post(`/providers/${id}/sync`);
    return data;
  }

  return {
    providers,
    loading,
    fetchProviders,
    createProvider,
    updateProvider,
    deleteProvider,
    testConnection,
    syncDomains,
  };
});
