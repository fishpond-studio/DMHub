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

export interface DNSProviderAdapter {
  id: string;
  name: string;

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
