import { Resolver } from 'dns';
import { promisify } from 'util';

export interface ResolverEndpoint {
  name: string;
  ip: string;
}

/** 多地公共 DNS，用于粗略判断解析是否已传播 */
export const PUBLIC_RESOLVERS: ResolverEndpoint[] = [
  { name: 'Google', ip: '8.8.8.8' },
  { name: 'Cloudflare', ip: '1.1.1.1' },
  { name: '阿里 DNS', ip: '223.5.5.5' },
  { name: '腾讯 DNS', ip: '119.29.29.29' },
  { name: 'OpenDNS', ip: '208.67.222.222' },
];

export interface PropagationHit {
  name: string;
  ip: string;
  ok: boolean;
  matched: boolean;
  values: string[];
  error?: string;
  latencyMs: number;
}

export interface PropagationResult {
  fqdn: string;
  recordType: string;
  expectedValue: string | null;
  checkedAt: string;
  total: number;
  resolved: number;
  matched: number;
  results: PropagationHit[];
}

function normalizeDnsValue(v: string, type: string): string {
  let s = v.trim().toLowerCase();
  if (type === 'CNAME' || type === 'NS' || type === 'MX' || type === 'PTR') {
    if (s.endsWith('.')) s = s.slice(0, -1);
  }
  // TXT 常带引号
  if (type === 'TXT') {
    s = s.replace(/^"+|"+$/g, '');
  }
  return s;
}

function valuesMatch(got: string[], expected: string | null, type: string): boolean {
  if (!expected) return got.length > 0;
  const exp = normalizeDnsValue(expected, type);
  return got.some((g) => {
    const n = normalizeDnsValue(g, type);
    if (n === exp) return true;
    // 包含匹配（多值 TXT / 长记录）
    if (type === 'TXT' && (n.includes(exp) || exp.includes(n))) return true;
    return false;
  });
}

async function queryResolver(
  resolverIp: string,
  fqdn: string,
  type: string,
): Promise<string[]> {
  const resolver = new Resolver();
  resolver.setServers([resolverIp]);
  const host = fqdn.replace(/\.$/, '');

  switch (type.toUpperCase()) {
    case 'A': {
      const fn = promisify(resolver.resolve4.bind(resolver));
      return await fn(host);
    }
    case 'AAAA': {
      const fn = promisify(resolver.resolve6.bind(resolver));
      return await fn(host);
    }
    case 'CNAME': {
      const fn = promisify(resolver.resolveCname.bind(resolver));
      return await fn(host);
    }
    case 'MX': {
      const fn = promisify(resolver.resolveMx.bind(resolver));
      const rows = await fn(host);
      return rows.map((r) => `${r.priority} ${r.exchange}`);
    }
    case 'TXT': {
      const fn = promisify(resolver.resolveTxt.bind(resolver));
      const rows = await fn(host);
      return rows.map((parts) => parts.join(''));
    }
    case 'NS': {
      const fn = promisify(resolver.resolveNs.bind(resolver));
      return await fn(host);
    }
    case 'SOA': {
      const fn = promisify(resolver.resolveSoa.bind(resolver));
      const soa = await fn(host);
      return [`${soa.nsname} ${soa.hostmaster}`];
    }
    default: {
      // 回退任意记录
      const fn = promisify(resolver.resolve.bind(resolver));
      const any = await fn(host, type.toUpperCase() as any);
      if (Array.isArray(any)) return any.map(String);
      return [String(any)];
    }
  }
}

/**
 * 向多个公共 DNS 查询某主机记录，判断是否与期望值一致。
 */
export async function checkDnsPropagation(options: {
  fqdn: string;
  recordType: string;
  expectedValue?: string | null;
  resolvers?: ResolverEndpoint[];
}): Promise<PropagationResult> {
  const fqdn = options.fqdn.trim().toLowerCase().replace(/\.$/, '');
  const recordType = (options.recordType || 'A').toUpperCase();
  const expectedValue = options.expectedValue?.trim() || null;
  const resolvers = options.resolvers?.length ? options.resolvers : PUBLIC_RESOLVERS;

  const results: PropagationHit[] = await Promise.all(
    resolvers.map(async (r) => {
      const started = Date.now();
      try {
        const values = await Promise.race([
          queryResolver(r.ip, fqdn, recordType),
          new Promise<string[]>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 8000),
          ),
        ]);
        const list = (values || []).map(String);
        return {
          name: r.name,
          ip: r.ip,
          ok: true,
          matched: valuesMatch(list, expectedValue, recordType),
          values: list,
          latencyMs: Date.now() - started,
        };
      } catch (err: any) {
        const code = err?.code || err?.message || 'error';
        return {
          name: r.name,
          ip: r.ip,
          ok: false,
          matched: false,
          values: [],
          error: String(code),
          latencyMs: Date.now() - started,
        };
      }
    }),
  );

  return {
    fqdn,
    recordType,
    expectedValue,
    checkedAt: new Date().toISOString(),
    total: results.length,
    resolved: results.filter((x) => x.ok).length,
    matched: results.filter((x) => x.matched).length,
    results,
  };
}

/** 由域名 + 主机记录拼 FQDN */
export function buildFqdn(domainName: string, recordName: string): string {
  const d = domainName.replace(/\.$/, '').toLowerCase();
  const n = (recordName || '@').trim().toLowerCase();
  if (!n || n === '@' || n === d) return d;
  if (n.endsWith(`.${d}`) || n === d) return n.replace(/\.$/, '');
  return `${n}.${d}`;
}
