import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '@/lib/axios';

export interface DomainAssignmentScope {
  id: string;
  permission: string;
  subdomainPattern: string;
}

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
  /** 非管理员：当前用户在该域名上的指派范围 */
  assignments?: DomainAssignmentScope[];
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
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CdnProxyInfo {
  supported: boolean;
  proxyRecordTypes: string[];
  proxyLabel: string;
  proxyDescription: string;
}

export interface DomainDetail extends Domain {
  providerDomainId: string | null;
  autoCheckExpiry: boolean;
  expiryRemindDays: number[];
  lastCheckedAt: string | null;
  notes?: string | null;
  sslExpiresAt?: string | null;
  sslLastCheckedAt?: string | null;
  sslIssuer?: string | null;
  /** 服务商是否支持 DNS 层 CDN 代理（如 Cloudflare） */
  cdnProxy?: CdnProxyInfo;
  /** @deprecated 兼容字段，优先使用 assignments */
  assignment: DomainAssignmentScope | null;
  /** 当前用户在该域名上的全部指派（管理员为空数组） */
  assignments?: DomainAssignmentScope[];
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
    notes?: string | null;
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
    notes?: string | null;
  }) {
    const { data } = await api.put(`/domains/${domainId}/records/${recordId}`, input);
    const idx = records.value.findIndex((r) => r.id === recordId);
    if (idx !== -1) records.value[idx] = data;
    return data;
  }

  async function checkPropagation(domainId: string, recordId: string) {
    const { data } = await api.post(`/domains/${domainId}/records/${recordId}/propagate`);
    return data as {
      fqdn: string;
      recordType: string;
      expectedValue: string | null;
      total: number;
      resolved: number;
      matched: number;
      results: Array<{
        name: string;
        ip: string;
        ok: boolean;
        matched: boolean;
        values: string[];
        error?: string;
        latencyMs: number;
      }>;
    };
  }

  async function checkSsl(domainId: string, hostname?: string) {
    const { data } = await api.post(`/domains/${domainId}/ssl-check`, { hostname });
    if (currentDomain.value && currentDomain.value.id === domainId && data.success) {
      currentDomain.value.sslExpiresAt = data.expiresAt;
      currentDomain.value.sslLastCheckedAt = data.checkedAt;
      currentDomain.value.sslIssuer = data.issuer;
    }
    return data as {
      success: boolean;
      valid: boolean;
      daysRemaining: number | null;
      expiresAt: string | null;
      issuer: string | null;
      subject: string | null;
      error?: string;
      checkedAt: string;
      hostname: string;
    };
  }

  async function deleteRecord(domainId: string, recordId: string) {
    await api.delete(`/domains/${domainId}/records/${recordId}`);
    records.value = records.value.filter((r) => r.id !== recordId);
  }

  async function bulkCreateRecords(
    domainId: string,
    items: Array<{
      recordType: string;
      name: string;
      value: string;
      ttl?: number;
      priority?: number;
      proxied?: boolean;
    }>,
  ) {
    const { data } = await api.post(`/domains/${domainId}/records/bulk`, { records: items });
    return data as {
      results: Array<{ success: boolean; recordType?: string; name?: string; error?: string }>;
      total: number;
      succeeded: number;
    };
  }

  async function bulkUpdateRecords(
    domainId: string,
    recordIds: string[],
    patch: { ttl?: number; proxied?: boolean },
  ) {
    const { data } = await api.post(`/domains/${domainId}/records/bulk-update`, {
      recordIds,
      ...patch,
    });
    return data as {
      total: number;
      succeeded: number;
      failed: number;
      results: Array<{ id: string; success: boolean; error?: string }>;
    };
  }

  async function bulkDeleteRecords(domainId: string, recordIds: string[]) {
    const { data } = await api.post(`/domains/${domainId}/records/bulk-delete`, { recordIds });
    if (data.succeeded > 0) {
      const ok = new Set(
        (data.results as Array<{ id: string; success: boolean }>)
          .filter((r) => r.success)
          .map((r) => r.id),
      );
      records.value = records.value.filter((r) => !ok.has(r.id));
    }
    return data as {
      total: number;
      succeeded: number;
      failed: number;
      results: Array<{ id: string; success: boolean; error?: string }>;
    };
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

  async function updateDomainNotes(domainId: string, notes: string | null) {
    const { data } = await api.put(`/domains/${domainId}/notes`, { notes });
    if (currentDomain.value && currentDomain.value.id === domainId) {
      currentDomain.value.notes = data.notes ?? null;
    }
    return data;
  }

  async function searchRecords(q: string, limit = 50) {
    const { data } = await api.get('/domains/search/records', { params: { q, limit } });
    return data.results as Array<{
      id: string;
      domainId: string;
      domainName: string;
      recordType: string;
      name: string;
      value: string;
      fqdn?: string;
    }>;
  }

  async function batchCheckExpiry(domainIds?: string[]) {
    const { data } = await api.post('/domains/check-expiry-batch', { domainIds, limit: 20 });
    return data as {
      total: number;
      succeeded: number;
      failed: number;
      results: Array<{ domainId: string; name?: string; success: boolean; expiresAt?: string; error?: string }>;
    };
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
    bulkCreateRecords,
    bulkUpdateRecords,
    bulkDeleteRecords,
    checkPropagation,
    checkSsl,
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
    updateDomainNotes,
    searchRecords,
    batchCheckExpiry,
  };
});
