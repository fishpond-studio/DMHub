import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '@/lib/axios';

export interface DnsSpeedResult {
  server: string;
  label: string;
  time: number;
  answers: string[];
  error?: string;
}

export interface HttpSpeedResult {
  ttfb: number;
  totalTime: number;
  statusCode: number;
  headers?: Record<string, string>;
  error?: string;
}

export const useSpeedtestStore = defineStore('speedtest', () => {
  const dnsResults = ref<DnsSpeedResult[]>([]);
  const httpResult = ref<HttpSpeedResult | null>(null);
  const dnsLoading = ref(false);
  const httpLoading = ref(false);

  async function runDnsTest(domainId: string) {
    dnsLoading.value = true;
    try {
      const { data } = await api.post(`/speedtest/dns/${domainId}`);
      dnsResults.value = data.results;
      return data.results;
    } finally {
      dnsLoading.value = false;
    }
  }

  async function runHttpTest(domainId: string) {
    httpLoading.value = true;
    try {
      const { data } = await api.post(`/speedtest/http/${domainId}`);
      httpResult.value = data;
      return data;
    } finally {
      httpLoading.value = false;
    }
  }

  function reset() {
    dnsResults.value = [];
    httpResult.value = null;
  }

  return {
    dnsResults,
    httpResult,
    dnsLoading,
    httpLoading,
    runDnsTest,
    runHttpTest,
    reset,
  };
});
