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

export interface MyDomain {
  id: string;
  name: string;
  status: string;
  groupName: string | null;
  createdAt: string;
  permission: 'dns_edit' | 'dns_readonly';
  assignmentId: string | null;
  subdomainPattern?: string;
}

export interface DomainOption {
  id: string;
  name: string;
  status: string;
  groupName: string | null;
}

export const useAssignmentStore = defineStore('assignment', () => {
  const memberAssignments = ref<DomainAssignment[]>([]);
  const pendingRequests = ref<AssignmentRequest[]>([]);
  const myRequests = ref<AssignmentRequest[]>([]);
  const myDomains = ref<MyDomain[]>([]);
  const domains = ref<DomainOption[]>([]);
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

  return {
    memberAssignments,
    pendingRequests,
    myRequests,
    myDomains,
    domains,
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
  };
});
