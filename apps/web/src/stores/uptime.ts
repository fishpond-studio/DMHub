import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '@/lib/axios';

export interface UptimeStatus {
  up: boolean;
  responseTime: number;
  lastChecked: string;
  history?: Array<{ timestamp: string; up: boolean; responseTime: number }>;
}

export interface HealthCheckResult {
  up: boolean;
  responseTime: number;
  statusCode: number;
}

export interface UptimeConfig {
  configured: boolean;
  pushUrl: string | null;
}

export const useUptimeStore = defineStore('uptime', () => {
  const status = ref<UptimeStatus | null>(null);
  const config = ref<UptimeConfig | null>(null);
  const checking = ref(false);
  const configuring = ref(false);
  const loadingStatus = ref(false);

  async function fetchConfig() {
    const { data } = await api.get('/uptime/configure');
    config.value = data;
    return data;
  }

  async function configure(pushUrl: string) {
    configuring.value = true;
    try {
      const { data } = await api.post('/uptime/configure', { pushUrl });
      config.value = { configured: true, pushUrl };
      return data;
    } finally {
      configuring.value = false;
    }
  }

  async function removeConfig() {
    await api.delete('/uptime/configure');
    config.value = { configured: false, pushUrl: null };
  }

  async function fetchStatus(domainId: string) {
    loadingStatus.value = true;
    try {
      const { data } = await api.get(`/uptime/status/${domainId}`);
      status.value = data;
      return data;
    } finally {
      loadingStatus.value = false;
    }
  }

  async function checkDomain(domainId: string) {
    checking.value = true;
    try {
      const { data } = await api.post(`/uptime/check/${domainId}`);
      status.value = {
        up: data.up,
        responseTime: data.responseTime,
        lastChecked: new Date().toISOString(),
        history: status.value?.history
          ? [{ timestamp: new Date().toISOString(), up: data.up, responseTime: data.responseTime }, ...status.value.history].slice(0, 20)
          : [{ timestamp: new Date().toISOString(), up: data.up, responseTime: data.responseTime }],
      };
      return data as HealthCheckResult;
    } finally {
      checking.value = false;
    }
  }

  return {
    status,
    config,
    checking,
    configuring,
    loadingStatus,
    fetchConfig,
    configure,
    removeConfig,
    fetchStatus,
    checkDomain,
  };
});
