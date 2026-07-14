import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '@/lib/axios';

export interface Domain {
  id: string;
  name: string;
  providerId: string | null;
  providerConfigId: string | null;
  providerName: string | null;
  expiresAt: string | null;
  tags: string[] | null;
  groupName: string | null;
  status: string;
  recordCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DnsRecord {
  id: string;
  domainId: string;
  recordType: string;
  name: string;
  value: string;
  ttl: number;
  priority: number | null;
  proxied: boolean;
  providerRecordId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface DomainDetail extends Domain {
  providerDomainId: string | null;
  autoCheckExpiry: boolean;
  expiryRemindDays: number[];
  lastCheckedAt: string | null;
  assignment: {
    id: string;
    permission: string;
    subdomainPattern: string;
  } | null;
}

export interface Snapshot {
  id: string;
  domainId: string;
  version: number;
  trigger: string;
  createdBy: string | null;
  createdAt: string;
  records?: SnapshotRecord[];
}

export interface SnapshotRecord {
  recordType: string;
  name: string;
  value: string;
  ttl: number;
  priority: number | null;
  proxied: boolean;
}

export interface SnapshotDiff {
  added: SnapshotRecord[];
  removed: SnapshotRecord[];
  modified: {
    before: SnapshotRecord;
    after: SnapshotRecord;
    changes: Record<string, [unknown, unknown]>;
  }[];
}

export interface GroupInfo {
  name: string;
  count: number;
}

export interface TagInfo {
  name: string;
  count: number;
}

export const useDomainStore = defineStore('domain', () => {
  const domains = ref<Domain[]>([]);
  const currentDomain = ref<DomainDetail | null>(null);
  const records = ref<DnsRecord[]>([]);
  const snapshots = ref<Snapshot[]>([]);
  const currentSnapshot = ref<Snapshot | null>(null);
  const snapshotDiff = ref<SnapshotDiff | null>(null);
  const groups = ref<GroupInfo[]>([]);
  const tags = ref<TagInfo[]>([]);
  const loading = ref(false);

  async function fetchDomains(filters?: { search?: string; status?: string; group?: string }) {
    loading.value = true;
    try {
      const params: Record<string, string> = {};
      if (filters?.search) params.search = filters.search;
      if (filters?.status) params.status = filters.status;
      if (filters?.group) params.group = filters.group;
      const { data } = await api.get('/domains', { params });
      domains.value = data.domains;
    } finally {
      loading.value = false;
    }
  }

  async function fetchDomain(id: string) {
    const { data } = await api.get(`/domains/${id}`);
    currentDomain.value = data;
    return data;
  }

  async function createDomain(input: {
    name: string;
    providerConfigId?: string;
    expiresAt?: string;
    tags?: string[];
    groupName?: string;
  }) {
    const { data } = await api.post('/domains', input);
    return data;
  }

  async function deleteDomain(id: string) {
    await api.delete(`/domains/${id}`);
    domains.value = domains.value.filter((d) => d.id !== id);
  }

  async function fetchRecords(domainId: string, filters?: { type?: string; search?: string }) {
    loading.value = true;
    try {
      const params: Record<string, string> = {};
      if (filters?.type) params.type = filters.type;
      if (filters?.search) params.search = filters.search;
      const { data } = await api.get(`/domains/${domainId}/records`, { params });
      records.value = data.records;
    } finally {
      loading.value = false;
    }
  }

  async function createRecord(domainId: string, input: {
    recordType: string;
    name: string;
    value: string;
    ttl?: number;
    priority?: number;
    proxied?: boolean;
  }) {
    const { data } = await api.post(`/domains/${domainId}/records`, input);
    records.value.push(data);
    return data;
  }

  async function updateRecord(domainId: string, recordId: string, input: {
    recordType?: string;
    name?: string;
    value?: string;
    ttl?: number;
    priority?: number;
    proxied?: boolean;
  }) {
    const { data } = await api.put(`/domains/${domainId}/records/${recordId}`, input);
    const idx = records.value.findIndex((r) => r.id === recordId);
    if (idx !== -1) records.value[idx] = data;
    return data;
  }

  async function deleteRecord(domainId: string, recordId: string) {
    await api.delete(`/domains/${domainId}/records/${recordId}`);
    records.value = records.value.filter((r) => r.id !== recordId);
  }

  async function syncRecords(domainId: string) {
    const { data } = await api.post(`/domains/${domainId}/sync`);
    return data as { synced: number; created: number; updated: number };
  }

  async function fetchSnapshots(domainId: string) {
    const { data } = await api.get(`/domains/${domainId}/snapshots`);
    snapshots.value = data.snapshots;
    return data.snapshots;
  }

  async function getSnapshotDetail(domainId: string, snapshotId: string) {
    const { data } = await api.get(`/domains/${domainId}/snapshots/${snapshotId}`);
    currentSnapshot.value = data;
    return data;
  }

  async function createSnapshot(domainId: string, trigger?: string) {
    const { data } = await api.post(`/domains/${domainId}/snapshots`, { trigger });
    return data;
  }

  async function rollbackSnapshot(domainId: string, snapshotId: string) {
    const { data } = await api.post(`/domains/${domainId}/snapshots/${snapshotId}/rollback`);
    return data;
  }

  async function diffSnapshots(domainId: string, fromVersion: number, toVersion: number) {
    const { data } = await api.get(`/domains/${domainId}/snapshots/diff`, {
      params: { from: fromVersion, to: toVersion },
    });
    snapshotDiff.value = data;
    return data;
  }

  async function fetchGroups() {
    const { data } = await api.get('/domains/groups');
    groups.value = data.groups;
    return data.groups;
  }

  async function fetchTags() {
    const { data } = await api.get('/domains/tags');
    tags.value = data.tags;
    return data.tags;
  }

  async function updateDomainTags(domainId: string, tagsList: string[]) {
    const { data } = await api.put(`/domains/${domainId}/tags`, { tags: tagsList });
    if (currentDomain.value && currentDomain.value.id === domainId) {
      currentDomain.value.tags = tagsList;
    }
    const idx = domains.value.findIndex((d) => d.id === domainId);
    if (idx !== -1) domains.value[idx].tags = tagsList;
    return data;
  }

  async function updateDomainGroup(domainId: string, groupName: string) {
    const { data } = await api.put(`/domains/${domainId}/group`, { groupName });
    if (currentDomain.value && currentDomain.value.id === domainId) {
      currentDomain.value.groupName = groupName || null;
    }
    const idx = domains.value.findIndex((d) => d.id === domainId);
    if (idx !== -1) domains.value[idx].groupName = groupName || null;
    return data;
  }

  return {
    domains,
    currentDomain,
    records,
    snapshots,
    currentSnapshot,
    snapshotDiff,
    groups,
    tags,
    loading,
    fetchDomains,
    fetchDomain,
    createDomain,
    deleteDomain,
    fetchRecords,
    createRecord,
    updateRecord,
    deleteRecord,
    syncRecords,
    fetchSnapshots,
    getSnapshotDetail,
    createSnapshot,
    rollbackSnapshot,
    diffSnapshots,
    fetchGroups,
    fetchTags,
    updateDomainTags,
    updateDomainGroup,
  };
});
