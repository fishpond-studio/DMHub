import { defineStore } from 'pinia';
import { ref } from 'vue';
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
  title: string;
  content: string;
  level: NotificationLevel;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export const useNotificationStore = defineStore('notification', () => {
  const notifications = ref<Notification[]>([]);
  const configs = ref<NotificationConfig[]>([]);
  const connected = ref(false);
  let eventSource: EventSource | null = null;
  let pollingTimer: ReturnType<typeof setInterval> | null = null;

  function addNotification(notification: Notification) {
    notifications.value.unshift(notification);
    if (notifications.value.length > 50) {
      notifications.value.length = 50;
    }
  }

  async function fetchNotifications() {
    try {
      const { data } = await api.get('/notifications');
      notifications.value = data.notifications ?? [];
    } catch { /* fetch failed, keep existing notifications */ }
  }

  async function fetchConfigs() {
    try {
      const { data } = await api.get('/notifications/configs');
      configs.value = data.configs ?? [];
    } catch { /* fetch failed, keep existing configs */ }
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

  async function updateConfig(id: string, input: {
    channel: string;
    name: string;
    config: Record<string, unknown>;
    events: string[];
    enabled: boolean;
  }) {
    const { data } = await api.put(`/notifications/configs/${id}`, input);
    const idx = configs.value.findIndex((c) => c.id === id);
    if (idx !== -1) configs.value[idx] = data;
    return data;
  }

  async function deleteConfig(id: string) {
    await api.delete(`/notifications/configs/${id}`);
    configs.value = configs.value.filter((c) => c.id !== id);
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
        const notification: Notification = {
          id: data.id,
          title: data.title,
          content: data.content,
          level: data.level,
          metadata: data.metadata,
          createdAt: data.createdAt,
        };
        addNotification(notification);
        toast({
          title: notification.title,
          description: notification.content,
          variant: notification.level === 'critical' || notification.level === 'warning' ? 'destructive' : 'default',
        });
      } catch { /* JSON parse failed, ignoring malformed SSE message */ }
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
    stopPolling();
  }

  return {
    notifications,
    configs,
    connected,
    addNotification,
    fetchNotifications,
    fetchConfigs,
    createConfig,
    updateConfig,
    deleteConfig,
    connectSSE,
    disconnect,
  };
});
