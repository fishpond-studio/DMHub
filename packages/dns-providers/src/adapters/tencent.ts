import type {
  Credentials,
  CreateRecordInput,
  DNSProviderAdapter,
  ProviderDomain,
  ProviderRecord,
  UpdateRecordInput,
} from '../types/index.js';

const API_ENDPOINT = 'https://dnspod.tencentcloudapi.com/';
const SERVICE = 'dnspod';
const VERSION = '2021-03-23';
const HOST = 'dnspod.tencentcloudapi.com';
const CT = 'application/json; charset=utf-8';
const SIGNED_HEADERS = 'content-type;host;x-tc-action';

const enc = new TextEncoder();

async function sha256Hex(data: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(data));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacSha256(
  key: Uint8Array | string,
  data: string,
): Promise<Uint8Array> {
  const keyBuf = typeof key === 'string' ? enc.encode(key) : key;
  const keyAb = keyBuf.buffer.slice(
    keyBuf.byteOffset,
    keyBuf.byteOffset + keyBuf.byteLength,
  ) as ArrayBuffer;
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyAb,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(
    await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data)),
  );
}

async function hmacSha256Hex(
  key: Uint8Array | string,
  data: string,
): Promise<string> {
  const sig = await hmacSha256(key, data);
  return Array.from(sig)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function buildAuthorization(
  secretId: string,
  secretKey: string,
  action: string,
  payload: string,
  timestamp: number,
): Promise<string> {
  const date = new Date(timestamp * 1000).toISOString().split('T')[0];
  const hashedPayload = await sha256Hex(payload);

  const canonicalRequest = [
    'POST',
    '/',
    '',
    `content-type:${CT}`,
    `host:${HOST}`,
    `x-tc-action:${action.toLowerCase()}`,
    '',
    SIGNED_HEADERS,
    hashedPayload,
  ].join('\n');

  const credentialScope = `${date}/${SERVICE}/tc3_request`;
  const stringToSign = [
    'TC3-HMAC-SHA256',
    String(timestamp),
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  const dateKey = await hmacSha256(secretKey, date);
  const serviceKey = await hmacSha256(dateKey, SERVICE);
  const signingKey = await hmacSha256(serviceKey, 'tc3_request');
  const signature = await hmacSha256Hex(signingKey, stringToSign);

  return `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${SIGNED_HEADERS}, Signature=${signature}`;
}

interface TencentResponse<T> {
  Response: T & { Error?: { Code: string; Message: string } };
}

async function tencentRequest<T>(
  secretId: string,
  secretKey: string,
  action: string,
  body: Record<string, unknown>,
): Promise<T> {
  const payload = JSON.stringify(body);
  const timestamp = Math.floor(Date.now() / 1000);
  const authorization = await buildAuthorization(
    secretId,
    secretKey,
    action,
    payload,
    timestamp,
  );

  const res = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': CT,
      Host: HOST,
      'X-TC-Action': action,
      'X-TC-Version': VERSION,
      'X-TC-Timestamp': String(timestamp),
      Authorization: authorization,
    },
    body: payload,
  });

  const json = (await res.json()) as TencentResponse<T>;

  if (json.Response.Error) {
    throw new Error(
      `Tencent API error: ${json.Response.Error.Code} - ${json.Response.Error.Message}`,
    );
  }

  return json.Response;
}

export class TencentAdapter implements DNSProviderAdapter {
  id = 'tencent' as const;
  name = 'Tencent Cloud DNS';

  async testConnection(credentials: Credentials): Promise<boolean> {
    try {
      await tencentRequest<unknown>(
        credentials.secretId,
        credentials.secretKey,
        'DescribeDomainList',
        { Offset: 0, Limit: 1 },
      );
      return true;
    } catch {
      return false;
    }
  }

  async listDomains(credentials: Credentials): Promise<ProviderDomain[]> {
    const result = await tencentRequest<{
      DomainList: {
        DomainId: number;
        Name: string;
        Status: string;
      }[];
    }>(
      credentials.secretId,
      credentials.secretKey,
      'DescribeDomainList',
      { Offset: 0, Limit: 100 },
    );
    return (result.DomainList ?? []).map((d) => ({
      id: d.Name,
      name: d.Name,
      status: d.Status === 'ENABLE' ? 'active' : d.Status.toLowerCase(),
    }));
  }

  async getDomainInfo(
    credentials: Credentials,
    domainId: string,
  ): Promise<ProviderDomain> {
    const result = await tencentRequest<{
      DomainInfo: { DomainId: number; Domain: string };
    }>(
      credentials.secretId,
      credentials.secretKey,
      'DescribeDomain',
      { Domain: domainId },
    );
    return {
      id: result.DomainInfo.Domain,
      name: result.DomainInfo.Domain,
      status: 'active',
    };
  }

  async listRecords(
    credentials: Credentials,
    domainId: string,
  ): Promise<ProviderRecord[]> {
    const result = await tencentRequest<{
      RecordList: {
        RecordId: number;
        Type: string;
        Name: string;
        Value: string;
        TTL: number;
        MX?: number;
      }[];
    }>(
      credentials.secretId,
      credentials.secretKey,
      'DescribeRecordList',
      { Domain: domainId, Offset: 0, Limit: 3000 },
    );
    return (result.RecordList ?? []).map((r) => ({
      id: String(r.RecordId),
      type: r.Type,
      name: r.Name,
      value: r.Value,
      ttl: r.TTL,
      priority: r.MX,
      proxied: false,
    }));
  }

  async createRecord(
    credentials: Credentials,
    domainId: string,
    record: CreateRecordInput,
  ): Promise<ProviderRecord> {
    const body: Record<string, unknown> = {
      Domain: domainId,
      SubDomain: record.name,
      RecordType: record.type,
      Value: record.value,
      RecordLine: '默认',
      TTL: record.ttl,
    };
    if (record.priority !== undefined) {
      body.MX = record.priority;
    }
    const result = await tencentRequest<{ RecordId: number }>(
      credentials.secretId,
      credentials.secretKey,
      'CreateRecord',
      body,
    );
    return {
      id: String(result.RecordId),
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
    domainId: string,
    recordId: string,
    record: UpdateRecordInput,
  ): Promise<ProviderRecord> {
    const body: Record<string, unknown> = {
      Domain: domainId,
      RecordId: Number(recordId),
      RecordLine: '默认',
    };
    if (record.name !== undefined) body.SubDomain = record.name;
    if (record.type !== undefined) body.RecordType = record.type;
    if (record.value !== undefined) body.Value = record.value;
    if (record.ttl !== undefined) body.TTL = record.ttl;
    if (record.priority !== undefined) body.MX = record.priority;

    await tencentRequest<unknown>(
      credentials.secretId,
      credentials.secretKey,
      'ModifyRecord',
      body,
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
    domainId: string,
    recordId: string,
  ): Promise<void> {
    await tencentRequest<unknown>(
      credentials.secretId,
      credentials.secretKey,
      'DeleteRecord',
      { Domain: domainId, RecordId: Number(recordId) },
    );
  }

  async getDomainExpiry(
    _credentials: Credentials,
    _domainId: string,
  ): Promise<null> {
    return null;
  }
}
