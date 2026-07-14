import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '@/lib/axios';

export interface OperationLog {
  id: string;
  userId: string;
  domainId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  detail: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  username: string | null;
}

export const useLogStore = defineStore('log', () => {
  const logs = ref<OperationLog[]>([]);
  const total = ref(0);
  const loading = ref(false);

  async function fetchLogs(filters?: {
    action?: string;
    userId?: string;
    domainId?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    pageSize?: number;
  }) {
    loading.value = true;
    try {
      const params: Record<string, string | number> = {};
      if (filters?.action) params.action = filters.action;
      if (filters?.userId) params.userId = filters.userId;
      if (filters?.domainId) params.domainId = filters.domainId;
      if (filters?.startDate) params.startDate = filters.startDate;
      if (filters?.endDate) params.endDate = filters.endDate;
      if (filters?.page) params.page = filters.page;
      if (filters?.pageSize) params.pageSize = filters.pageSize;
      const { data } = await api.get('/logs', { params });
      logs.value = data.logs;
      total.value = data.total;
    } finally {
      loading.value = false;
    }
  }

  return { logs, total, loading, fetchLogs };
});
