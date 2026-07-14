import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '@/lib/axios';

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  permissions: string[];
  lastUsedAt: string | null;
  createdAt: string;
}

export interface GeneratedApiKey {
  key: string;
  name: string;
  permissions: string[];
}

export const useApiKeyStore = defineStore('api-key', () => {
  const keys = ref<ApiKey[]>([]);
  const loading = ref(false);
  const generatedKey = ref<GeneratedApiKey | null>(null);

  async function fetchKeys() {
    loading.value = true;
    try {
      const { data } = await api.get('/api-keys');
      keys.value = data.keys;
      return data.keys;
    } finally {
      loading.value = false;
    }
  }

  async function generateKey(name: string, permissions: string[]) {
    const { data } = await api.post('/api-keys', { name, permissions });
    generatedKey.value = data;
    await fetchKeys();
    return data as GeneratedApiKey;
  }

  async function revokeKey(keyId: string) {
    await api.delete(`/api-keys/${keyId}`);
    keys.value = keys.value.filter((k) => k.id !== keyId);
  }

  function clearGeneratedKey() {
    generatedKey.value = null;
  }

  return {
    keys,
    loading,
    generatedKey,
    fetchKeys,
    generateKey,
    revokeKey,
    clearGeneratedKey,
  };
});
