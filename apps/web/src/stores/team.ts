import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '@/lib/axios';

export interface TeamSettings {
  id: number;
  name: string | null;
  description: string | null;
  logoUrl: string | null;
  defaultRole: string;
  initialized: boolean;
  siteUrl: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpFrom: string | null;
  smtpSecure: boolean | null;
  inviteCodeEnabled: boolean;
  registrationEnabled: boolean;
  announcement: string | null;
  announcementFormat: string | null;
  landingSubtitle: string | null;
  landingBackgroundUrl: string | null;
  footerContent: string | null;
  footerFormat: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InviteCode {
  id: string;
  code: string;
  maxUses: number;
  currentUses: number;
  expiresAt: string | null;
  createdBy: string;
  createdAt: string;
}

export interface Member {
  id: string;
  username: string;
  email: string | null;
  displayName: string | null;
  role: string;
  twoFactorEnabled: boolean;
  status: string;
  createdAt: string;
}

export const useTeamStore = defineStore('team', () => {
  const settings = ref<TeamSettings | null>(null);
  const inviteCodes = ref<InviteCode[]>([]);
  const members = ref<Member[]>([]);
  const loading = ref(false);

  async function fetchSettings() {
    loading.value = true;
    try {
      const { data } = await api.get('/team/settings');
      settings.value = data.settings;
    } finally {
      loading.value = false;
    }
  }

  async function updateSettings(input: Partial<TeamSettings> & { smtpPassword?: string }): Promise<{ warnings: string[] }> {
    const { data } = await api.put('/team/settings', input);
    settings.value = data.settings;
    return { warnings: data.warnings ?? [] };
  }

  async function uploadLogo(file: File): Promise<{ logoUrl: string }> {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await api.post('/team/logo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    if (settings.value) {
      settings.value.logoUrl = data.logoUrl;
    }
    return data;
  }

  async function fetchInviteCodes() {
    loading.value = true;
    try {
      const { data } = await api.get('/team/invite-codes');
      inviteCodes.value = data.codes;
    } finally {
      loading.value = false;
    }
  }

  async function createInviteCode(maxUses?: number, expiresAt?: string): Promise<InviteCode> {
    const { data } = await api.post('/team/invite-codes', { maxUses, expiresAt });
    inviteCodes.value.unshift(data.code);
    return data.code;
  }

  async function regenerateInviteCodes(confirmed: boolean): Promise<InviteCode> {
    const { data } = await api.post('/team/invite-codes/regenerate', { confirmed });
    inviteCodes.value = [data.code];
    return data.code;
  }

  async function fetchMembers() {
    loading.value = true;
    try {
      const { data } = await api.get('/team/members');
      members.value = data.members;
    } finally {
      loading.value = false;
    }
  }

  async function updateMemberRole(userId: string, role: string): Promise<{ warning: string }> {
    const { data } = await api.put(`/team/members/${userId}/role`, { role });
    const idx = members.value.findIndex((m) => m.id === userId);
    if (idx !== -1) {
      members.value[idx].role = role;
    }
    return data;
  }

  async function removeMember(userId: string) {
    await api.delete(`/team/members/${userId}`);
    members.value = members.value.filter((m) => m.id !== userId);
  }

  async function updateMemberStatus(userId: string, status: string): Promise<{ success: boolean }> {
    const { data } = await api.put(`/team/members/${userId}/status`, { status });
    const idx = members.value.findIndex((m) => m.id === userId);
    if (idx !== -1) {
      members.value[idx].status = status;
    }
    return data;
  }

  return {
    settings,
    inviteCodes,
    members,
    loading,
    fetchSettings,
    updateSettings,
    uploadLogo,
    fetchInviteCodes,
    createInviteCode,
    regenerateInviteCodes,
    fetchMembers,
    updateMemberRole,
    removeMember,
    updateMemberStatus,
  };
});
