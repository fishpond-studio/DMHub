import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '@/lib/axios';

export interface DashboardStats {
  totalDomains: number;
  activeDomains: number;
  expiringDomains: number;
  expiredDomains: number;
  totalRecords: number;
  totalMembers: number;
  recentChanges: number;
  recordsByType: Record<string, number>;
}

export interface ExpiringDomain {
  domain: string;
  domainId: string;
  expiresAt: string;
  daysRemaining: number;
  status: string;
}

export interface ActivityItem {
  action: string;
  targetName: string;
  userName: string;
  createdAt: string;
}

export interface RecordsDistribution {
  labels: string[];
  data: number[];
}

export const useDashboardStore = defineStore('dashboard', () => {
  const stats = ref<DashboardStats | null>(null);
  const expiring = ref<ExpiringDomain[]>([]);
  const activity = ref<ActivityItem[]>([]);
  const distribution = ref<RecordsDistribution | null>(null);
  const loading = ref(false);

  async function fetchAll() {
    loading.value = true;
    try {
      const [statsRes, expiringRes, activityRes, distRes] = await Promise.all([
        api.get('/dashboard/stats'),
        api.get('/dashboard/expiring'),
        api.get('/dashboard/activity'),
        api.get('/dashboard/records-distribution'),
      ]);
      stats.value = statsRes.data;
      expiring.value = Array.isArray(expiringRes.data) ? expiringRes.data : [];
      activity.value = Array.isArray(activityRes.data) ? activityRes.data : [];
      distribution.value = distRes.data;
    } catch {
      console.error('Dashboard data fetch failed, keeping existing values');
    } finally {
      loading.value = false;
    }
  }

  return { stats, expiring, activity, distribution, loading, fetchAll };
});
