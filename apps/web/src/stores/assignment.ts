import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '@/lib/axios';

export interface DomainAssignment {
  id: string;
  domainId: string;
  userId: string;
  subdomainPattern: string;
  permission: 'dns_edit' | 'dns_readonly';
  assignedBy: string;
  createdAt: string;
  domainName?: string;
}

export interface AssignmentRequest {
  id: string;
  domainId: string;
  userId?: string;
  subdomainPattern: string;
  permission: 'dns_edit' | 'dns_readonly';
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string | null;
  reviewComment?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
  domainName?: string;
  username?: string;
  displayName?: string;
}

export interface MyDomainAssignment {
  id: string | null;
  subdomainPattern: string;
  permission: 'dns_edit' | 'dns_readonly' | string;
}

export interface MyDomain {
  id: string;
  name: string;
  status: string;
  groupName: string | null;
  createdAt: string;
  permission: 'dns_edit' | 'dns_readonly';
  assignmentId: string | null;
  subdomainPattern?: string;
  /** 同一域名下的全部指派范围（可能多条） */
  assignments?: MyDomainAssignment[];
}

export interface DomainOption {
  id: string;
  name: string;
  status: string;
  groupName: string | null;
}

export interface AssignmentOverviewItem {
  id: string;
  domainId: string;
  domainName: string;
  domainStatus: string;
  userId: string;
  username: string;
  displayName: string | null;
  userStatus: string;
  subdomainPattern: string;
  host: string;
  permission: string;
  createdAt: string;
  scopeStatus: 'empty' | 'active' | 'member_disabled' | 'domain_issue';
  recordCount: number;
  proxiedCount: number;
  typeCounts: Record<string, number>;
  lastRecordUpdatedAt: string | null;
  records: Array<{
    id: string;
    recordType: string;
    name: string;
    value: string;
    ttl: number;
    proxied: boolean;
    status: string;
    updatedAt: string;
  }>;
}

export interface AssignmentOverviewSummary {
  total: number;
  active: number;
  empty: number;
  memberDisabled: number;
  domainIssue: number;
  totalRecords: number;
}

export const useAssignmentStore = defineStore('assignment', () => {
  const memberAssignments = ref<DomainAssignment[]>([]);
  const pendingRequests = ref<AssignmentRequest[]>([]);
  const myRequests = ref<AssignmentRequest[]>([]);
  const myDomains = ref<MyDomain[]>([]);
  const domains = ref<DomainOption[]>([]);
  const overview = ref<AssignmentOverviewItem[]>([]);
  const overviewSummary = ref<AssignmentOverviewSummary | null>(null);
  const loading = ref(false);

  async function fetchMemberAssignments(userId: string) {
    loading.value = true;
    try {
      const { data } = await api.get(`/assignments/team/members/${userId}/assignments`);
      memberAssignments.value = data.assignments;
    } finally {
      loading.value = false;
    }
  }

  async function createAssignment(
    userId: string,
    input: { domainId: string; subdomainPattern?: string; permission?: string },
  ) {
    const { data } = await api.post(`/assignments/team/members/${userId}/assignments`, input);
    return data;
  }

  async function deleteAssignment(userId: string, assignmentId: string) {
    await api.delete(`/assignments/team/members/${userId}/assignments/${assignmentId}`);
  }

  async function createRequest(input: {
    domainId: string;
    subdomainPattern?: string;
    permission?: string;
    reason: string;
  }) {
    const { data } = await api.post('/assignments/requests', input);
    return data;
  }

  async function reviewRequest(
    id: string,
    input: { action: 'approve' | 'reject'; reviewComment?: string; confirmed?: boolean },
  ) {
    const { data } = await api.put(`/assignments/requests/${id}`, input);
    return data;
  }

  async function fetchPendingRequests() {
    loading.value = true;
    try {
      const { data } = await api.get('/assignments/requests/pending');
      pendingRequests.value = data.requests;
    } finally {
      loading.value = false;
    }
  }

  async function fetchMyRequests() {
    loading.value = true;
    try {
      const { data } = await api.get('/assignments/requests/mine');
      myRequests.value = data.requests;
    } finally {
      loading.value = false;
    }
  }

  async function fetchMyDomains() {
    loading.value = true;
    try {
      const { data } = await api.get('/assignments/my/domains');
      myDomains.value = data.domains;
    } finally {
      loading.value = false;
    }
  }

  async function fetchDomains() {
    const { data } = await api.get('/assignments/domains');
    domains.value = data.domains;
  }

  async function fetchOverview() {
    loading.value = true;
    try {
      const { data } = await api.get('/assignments/overview');
      overview.value = data.assignments || [];
      overviewSummary.value = data.summary || null;
    } finally {
      loading.value = false;
    }
  }

  return {
    memberAssignments,
    pendingRequests,
    myRequests,
    myDomains,
    domains,
    overview,
    overviewSummary,
    loading,
    fetchMemberAssignments,
    createAssignment,
    deleteAssignment,
    createRequest,
    reviewRequest,
    fetchPendingRequests,
    fetchMyRequests,
    fetchMyDomains,
    fetchDomains,
    fetchOverview,
  };
});
