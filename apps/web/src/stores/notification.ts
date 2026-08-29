import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import api from '@/lib/axios';
import { getAccessToken } from '@/lib/axios';
import type { NotificationLevel } from '@dmhub/shared';
import { toast } from '@/components/ui/toast/use-toast';

export interface NotificationConfig {
  id: string;
  channel: string;
  name: string;
  config: Record<string, unknown>;
  events: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  id: string;
  event?: string;
  title: string;
  content: string;
  level: NotificationLevel | string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  read?: boolean;
}

export const useNotificationStore = defineStore('notification', () => {
  const notifications = ref<Notification[]>([]);
  const configs = ref<NotificationConfig[]>([]);
  const connected = ref(false);
  let eventSource: EventSource | null = null;
  let pollingTimer: ReturnType<typeof setInterval> | null = null;
  let started = false;

  const unreadCount = computed(() => notifications.value.filter((n) => !n.read).length);

  function addNotification(notification: Notification, opts?: { silent?: boolean }) {
    // 去重：SSE 与轮询可能重复
    if (notifications.value.some((n) => n.id === notification.id)) return;

    notifications.value.unshift({
      ...notification,
      read: notification.read ?? false,
    });
    if (notifications.value.length > 50) {
      notifications.value.length = 50;
    }

    if (!opts?.silent) {
      toast({
        title: notification.title,
        description: notification.content,
        duration: 5000,
        variant:
          notification.level === 'critical' || notification.level === 'warning'
            ? 'destructive'
            : 'default',
      });
    }
  }

  async function fetchNotifications() {
    try {
      const { data } = await api.get('/notifications');
      const list: Notification[] = (data.notifications ?? []).map((n: Notification) => ({
        ...n,
        read: n.read ?? false,
      }));
      notifications.value = list;
    } catch {
      /* keep existing */
    }
  }

  async function fetchConfigs() {
    try {
      const { data } = await api.get('/notifications/configs');
      configs.value = data.configs ?? [];
    } catch {
      /* keep existing */
    }
  }

  async function createConfig(input: {
    channel: string;
    name: string;
    config: Record<string, unknown>;
    events: string[];
    enabled: boolean;
  }) {
    const { data } = await api.post('/notifications', input);
    configs.value.push(data);
    return data;
  }

  async function updateConfig(
    id: string,
    input: {
      channel: string;
      name: string;
      config: Record<string, unknown>;
      events: string[];
      enabled: boolean;
    },
  ) {
    const { data } = await api.put(`/notifications/configs/${id}`, input);
    const idx = configs.value.findIndex((c) => c.id === id);
    if (idx !== -1) configs.value[idx] = data;
    return data;
  }

  async function deleteConfig(id: string) {
    await api.delete(`/notifications/configs/${id}`);
    configs.value = configs.value.filter((c) => c.id !== id);
  }

  async function markRead(id: string) {
    const item = notifications.value.find((n) => n.id === id);
    if (item) item.read = true;
    try {
      await api.post(`/notifications/${id}/read`);
    } catch {
      /* ignore */
    }
  }

  async function markAllRead() {
    for (const n of notifications.value) n.read = true;
    try {
      await api.post('/notifications/read-all');
    } catch {
      /* ignore */
    }
  }

  async function removeNotification(id: string) {
    notifications.value = notifications.value.filter((n) => n.id !== id);
    try {
      await api.delete(`/notifications/${id}`);
    } catch {
      /* ignore */
    }
  }

  async function clearAll() {
    notifications.value = [];
    try {
      await api.delete('/notifications');
    } catch {
      /* ignore */
    }
  }

  function connectSSE() {
    const token = getAccessToken();
    if (!token) return;

    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }

    if (typeof EventSource === 'undefined') {
      startPolling();
      return;
    }

    const base = api.defaults.baseURL || '/api';
    const url = `${base}/notifications/stream?token=${encodeURIComponent(token)}`;

    eventSource = new EventSource(url);

    eventSource.onopen = () => {
      connected.value = true;
      stopPolling();
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.event === 'connected') return;
        if (!data.id || !data.title) return;
        const notification: Notification = {
          id: data.id,
          event: data.event,
          title: data.title,
          content: data.content,
          level: data.level,
          metadata: data.metadata,
          createdAt: data.createdAt,
          read: data.read ?? false,
        };
        addNotification(notification);
      } catch {
        /* ignore malformed */
      }
    };

    eventSource.onerror = () => {
      connected.value = false;
      eventSource?.close();
      eventSource = null;
      startPolling();
    };
  }

  function startPolling() {
    if (pollingTimer) return;
    fetchNotifications();
    pollingTimer = setInterval(fetchNotifications, 30000);
  }

  function stopPolling() {
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
  }

  function disconnect() {
    eventSource?.close();
    eventSource = null;
    connected.value = false;
    started = false;
    stopPolling();
  }

  /** 登录后启动：拉历史 + SSE */
  async function start() {
    if (started) return;
    started = true;
    await fetchNotifications();
    connectSSE();
  }

  return {
    notifications,
    configs,
    connected,
    unreadCount,
    addNotification,
    fetchNotifications,
    fetchConfigs,
    createConfig,
    updateConfig,
    deleteConfig,
    markRead,
    markAllRead,
    removeNotification,
    clearAll,
    connectSSE,
    disconnect,
    start,
  };
});
