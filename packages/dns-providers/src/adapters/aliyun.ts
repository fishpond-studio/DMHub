import type {
  Credentials,
  CreateRecordInput,
  DNSProviderAdapter,
  ProviderDomain,
  ProviderRecord,
  UpdateRecordInput,
} from '../types/index.js';

const API_ENDPOINT = 'https://alidns.aliyuncs.com/';

function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A');
}

async function hmacSha1Base64(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function signRequest(
  accessKeySecret: string,
  params: Record<string, string>,
): Promise<string> {
  const canonicalized = Object.keys(params)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`)
    .join('&');
  const stringToSign = `GET&${percentEncode('/')}&${percentEncode(canonicalized)}`;
  return hmacSha1Base64(`${accessKeySecret}&`, stringToSign);
}

async function aliyunRequest<T>(
  accessKeyId: string,
  accessKeySecret: string,
  action: string,
  extraParams: Record<string, string> = {},
): Promise<T> {
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const nonce = crypto.randomUUID();

  const params: Record<string, string> = {
    Format: 'JSON',
    Version: '2015-01-09',
    AccessKeyId: accessKeyId,
    SignatureMethod: 'HMAC-SHA1',
    Timestamp: timestamp,
    SignatureVersion: '1.0',
    SignatureNonce: nonce,
    Action: action,
    ...extraParams,
  };

  params.Signature = await signRequest(accessKeySecret, params);

  const qs = Object.entries(params)
    .map(([k, v]) => `${percentEncode(k)}=${percentEncode(v)}`)
    .join('&');

  const res = await fetch(`${API_ENDPOINT}?${qs}`);
  const json = (await res.json()) as Record<string, unknown>;

  if (json.Code) {
    throw new Error(`Aliyun API error: ${json.Code} - ${json.Message}`);
  }

  return json as T;
}

export class AliyunAdapter implements DNSProviderAdapter {
  id = 'aliyun' as const;
  name = 'Aliyun DNS';

  async testConnection(credentials: Credentials): Promise<boolean> {
    try {
      await aliyunRequest(
        credentials.accessKeyId,
        credentials.accessKeySecret,
        'DescribeDomains',
        { PageNumber: '1', PageSize: '1' },
      );
      return true;
    } catch {
      return false;
    }
  }

  async listDomains(credentials: Credentials): Promise<ProviderDomain[]> {
    const result = await aliyunRequest<{
      Domains: {
        Domain: {
          DomainId: string;
          DomainName: string;
          DnsServers: { DnsServer: string }[];
        }[];
      };
    }>(
      credentials.accessKeyId,
      credentials.accessKeySecret,
      'DescribeDomains',
      { PageNumber: '1', PageSize: '100' },
    );
    return (result.Domains?.Domain ?? []).map((d) => ({
      id: d.DomainName,
      name: d.DomainName,
      status: 'active',
      nameservers: d.DnsServers?.map((s) => s.DnsServer),
    }));
  }

  async getDomainInfo(
    credentials: Credentials,
    domainId: string,
  ): Promise<ProviderDomain> {
    const result = await aliyunRequest<{
      DomainId: string;
      DomainName: string;
      DnsServers: { DnsServer: string }[];
    }>(
      credentials.accessKeyId,
      credentials.accessKeySecret,
      'DescribeDomainInfo',
      { DomainName: domainId },
    );
    return {
      id: result.DomainName,
      name: result.DomainName,
      status: 'active',
      nameservers: result.DnsServers?.map((s) => s.DnsServer),
    };
  }

  async listRecords(
    credentials: Credentials,
    domainId: string,
  ): Promise<ProviderRecord[]> {
    const result = await aliyunRequest<{
      DomainRecords: {
        Record: {
          RecordId: string;
          Type: string;
          RR: string;
          Value: string;
          TTL: number;
          Priority?: number;
        }[];
      };
    }>(
      credentials.accessKeyId,
      credentials.accessKeySecret,
      'DescribeDomainRecords',
      { DomainName: domainId, PageNumber: '1', PageSize: '500' },
    );
    return (result.DomainRecords?.Record ?? []).map((r) => ({
      id: r.RecordId,
      type: r.Type,
      name: r.RR,
      value: r.Value,
      ttl: r.TTL,
      priority: r.Priority,
      proxied: false,
    }));
  }

  async createRecord(
    credentials: Credentials,
    domainId: string,
    record: CreateRecordInput,
  ): Promise<ProviderRecord> {
    const params: Record<string, string> = {
      DomainName: domainId,
      RR: record.name,
      Type: record.type,
      Value: record.value,
      TTL: String(record.ttl),
    };
    if (record.priority !== undefined) {
      params.Priority = String(record.priority);
    }
    const result = await aliyunRequest<{ RecordId: string }>(
      credentials.accessKeyId,
      credentials.accessKeySecret,
      'AddDomainRecord',
      params,
    );
    return {
      id: result.RecordId,
      type: record.type,
      name: record.name,
      value: record.value,
      ttl: record.ttl,
      priority: record.priority,
      proxied: false,
    };
  }

  async updateRecord(
    credentials: Credentials,
    _domainId: string,
    recordId: string,
    record: UpdateRecordInput,
  ): Promise<ProviderRecord> {
    const params: Record<string, string> = { RecordId: recordId };
    if (record.name !== undefined) params.RR = record.name;
    if (record.type !== undefined) params.Type = record.type;
    if (record.value !== undefined) params.Value = record.value;
    if (record.ttl !== undefined) params.TTL = String(record.ttl);
    if (record.priority !== undefined) params.Priority = String(record.priority);

    await aliyunRequest(
      credentials.accessKeyId,
      credentials.accessKeySecret,
      'UpdateDomainRecord',
      params,
    );

    return {
      id: recordId,
      type: record.type ?? '',
      name: record.name ?? '',
      value: record.value ?? '',
      ttl: record.ttl ?? 600,
      priority: record.priority,
      proxied: false,
    };
  }

  async deleteRecord(
    credentials: Credentials,
    _domainId: string,
    recordId: string,
  ): Promise<void> {
    await aliyunRequest(
      credentials.accessKeyId,
      credentials.accessKeySecret,
      'DeleteDomainRecord',
      { RecordId: recordId },
    );
  }

  async getDomainExpiry(
    _credentials: Credentials,
    _domainId: string,
  ): Promise<null> {
    return null;
  }
}
