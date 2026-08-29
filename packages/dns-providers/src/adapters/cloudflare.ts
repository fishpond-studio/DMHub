import type { DNSProviderAdapter, Credentials, ProviderDomain, ProviderRecord, CreateRecordInput, UpdateRecordInput } from '../types/index.js';

const API_BASE = 'https://api.cloudflare.com/client/v4';

async function cfFetch<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  const json = await res.json() as { success: boolean; result: T; errors: { message: string }[] };
  if (!json.success) {
    throw new Error(json.errors.map((e) => e.message).join(', '));
  }
  return json.result;
}

export class CloudflareAdapter implements DNSProviderAdapter {
  id = 'cloudflare' as const;
  name = 'Cloudflare';
  capabilities = {
    supportsProxy: true,
    proxyRecordTypes: ['A', 'AAAA', 'CNAME'],
    proxyLabel: 'CDN 保护（Cloudflare Proxy）',
    proxyDescription:
      '开启后流量经 Cloudflare 反代（橙云），隐藏源站 IP 并启用 CDN/WAF；关闭则为仅 DNS（灰云）',
  };

  async testConnection(credentials: Credentials): Promise<boolean> {
    try {
      await cfFetch<unknown>('/zones', credentials.token, {
        method: 'GET',
      });
      return true;
    } catch {
      return false;
    }
  }

  async listDomains(credentials: Credentials): Promise<ProviderDomain[]> {
    const result = await cfFetch<{ id: string; name: string; status: string; name_servers?: string[]; locked?: boolean }[]>(
      '/zones?per_page=50',
      credentials.token,
    );
    return result.map((z) => ({
      id: z.id,
      name: z.name,
      status: z.status,
      nameservers: z.name_servers,
      locked: z.locked,
    }));
  }

  async getDomainInfo(credentials: Credentials, domainId: string): Promise<ProviderDomain> {
    const z = await cfFetch<{ id: string; name: string; status: string; name_servers?: string[]; locked?: boolean }>(
      `/zones/${domainId}`,
      credentials.token,
    );
    return {
      id: z.id,
      name: z.name,
      status: z.status,
      nameservers: z.name_servers,
      locked: z.locked,
    };
  }

  async listRecords(credentials: Credentials, domainId: string): Promise<ProviderRecord[]> {
    const result = await cfFetch<
      {
        id: string;
        type: string;
        name: string;
        content: string;
        ttl: number;
        priority?: number;
        proxied?: boolean;
      }[]
    >(`/zones/${domainId}/dns_records?per_page=100`, credentials.token);
    return result.map((r) => ({
      id: r.id,
      type: r.type,
      name: r.name,
      value: r.content,
      ttl: r.ttl,
      priority: r.priority,
      proxied: r.proxied,
    }));
  }

  async createRecord(
    credentials: Credentials,
    domainId: string,
    record: CreateRecordInput,
  ): Promise<ProviderRecord> {
    const body: Record<string, unknown> = {
      type: record.type,
      name: record.name,
      content: record.value,
      ttl: record.ttl,
      proxied: record.proxied ?? false,
    };
    if (record.priority !== undefined) {
      body.priority = record.priority;
    }
    const r = await cfFetch<{
      id: string;
      type: string;
      name: string;
      content: string;
      ttl: number;
      priority?: number;
      proxied?: boolean;
    }>(`/zones/${domainId}/dns_records`, credentials.token, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return {
      id: r.id,
      type: r.type,
      name: r.name,
      value: r.content,
      ttl: r.ttl,
      priority: r.priority,
      proxied: r.proxied,
    };
  }

  async updateRecord(
    credentials: Credentials,
    domainId: string,
    recordId: string,
    record: UpdateRecordInput,
  ): Promise<ProviderRecord> {
    const body: Record<string, unknown> = {};
    if (record.type !== undefined) body.type = record.type;
    if (record.name !== undefined) body.name = record.name;
    if (record.value !== undefined) body.content = record.value;
    if (record.ttl !== undefined) body.ttl = record.ttl;
    if (record.proxied !== undefined) body.proxied = record.proxied;
    if (record.priority !== undefined) body.priority = record.priority;
    const r = await cfFetch<{
      id: string;
      type: string;
      name: string;
      content: string;
      ttl: number;
      priority?: number;
      proxied?: boolean;
    }>(`/zones/${domainId}/dns_records/${recordId}`, credentials.token, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return {
      id: r.id,
      type: r.type,
      name: r.name,
      value: r.content,
      ttl: r.ttl,
      priority: r.priority,
      proxied: r.proxied,
    };
  }

  async deleteRecord(credentials: Credentials, domainId: string, recordId: string): Promise<void> {
    await cfFetch<unknown>(`/zones/${domainId}/dns_records/${recordId}`, credentials.token, {
      method: 'DELETE',
    });
  }

  async getDomainExpiry(_credentials: Credentials, _domainId: string): Promise<null> {
    return null;
  }
}
