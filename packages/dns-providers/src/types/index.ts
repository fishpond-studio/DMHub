export interface Credentials {
  [key: string]: string;
}

export interface ProviderDomain {
  id: string;
  name: string;
  status: string;
  expiresAt?: Date;
  nameservers?: string[];
  locked?: boolean;
}

export interface ProviderRecord {
  id: string;
  type: string;
  name: string;
  value: string;
  ttl: number;
  priority?: number;
  proxied?: boolean;
}

export interface CreateRecordInput {
  type: string;
  name: string;
  value: string;
  ttl: number;
  priority?: number;
  proxied?: boolean;
}

export type UpdateRecordInput = Partial<CreateRecordInput>;

/** 服务商能力声明（CDN 代理等） */
export interface ProviderCapabilities {
  /** 是否支持 DNS 层 CDN/代理（如 Cloudflare orange cloud） */
  supportsProxy: boolean;
  /** 可开启代理的记录类型 */
  proxyRecordTypes: string[];
  /** UI 展示名 */
  proxyLabel: string;
  /** 简要说明 */
  proxyDescription: string;
}

export const DEFAULT_CAPABILITIES: ProviderCapabilities = {
  supportsProxy: false,
  proxyRecordTypes: [],
  proxyLabel: 'CDN 保护',
  proxyDescription: '当前服务商不支持在 DNS 记录上直接开启 CDN 代理',
};

export interface DNSProviderAdapter {
  id: string;
  name: string;
  /** 可选能力；缺省视为不支持 CDN 代理 */
  capabilities?: ProviderCapabilities;

  testConnection(credentials: Credentials): Promise<boolean>;
  listDomains(credentials: Credentials): Promise<ProviderDomain[]>;
  getDomainInfo(credentials: Credentials, domainId: string): Promise<ProviderDomain>;
  listRecords(credentials: Credentials, domainId: string): Promise<ProviderRecord[]>;
  createRecord(
    credentials: Credentials,
    domainId: string,
    record: CreateRecordInput,
  ): Promise<ProviderRecord>;
  updateRecord(
    credentials: Credentials,
    domainId: string,
    recordId: string,
    record: UpdateRecordInput,
  ): Promise<ProviderRecord>;
  deleteRecord(credentials: Credentials, domainId: string, recordId: string): Promise<void>;
  getDomainExpiry(credentials: Credentials, domainId: string): Promise<Date | null>;
}
