import net from 'net';
import https from 'https';
import { isPublicDomainSync, isPublicDomain } from './ssrf-guard.js';

interface WhoisResult {
  expiresAt: string | null;
  registrar: string | null;
  rawExpiry: string | null;
  /** 查询路径提示，便于排查（rdap / whois / whois-referral / whois-servers） */
  source?: string | null;
}

const RDAP_BOOTSTRAP = 'https://data.iana.org/rdap/dns.json';

let rdapCache: Record<string, string> | null = null;

/** 常见多级后缀（中国等），WHOIS/RDAP 应按完整后缀匹配 */
const MULTI_LEVEL_TLDS = [
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn', 'ac.cn', 'mil.cn',
  'ah.cn', 'bj.cn', 'cq.cn', 'fj.cn', 'gd.cn', 'gs.cn', 'gz.cn', 'gx.cn',
  'ha.cn', 'hb.cn', 'he.cn', 'hi.cn', 'hl.cn', 'hn.cn', 'jl.cn', 'js.cn',
  'jx.cn', 'ln.cn', 'nm.cn', 'nx.cn', 'qh.cn', 'sc.cn', 'sd.cn', 'sh.cn',
  'sn.cn', 'sx.cn', 'tj.cn', 'xj.cn', 'xz.cn', 'yn.cn', 'zj.cn',
  'co.uk', 'org.uk', 'me.uk', 'ac.uk', 'gov.uk',
  'com.au', 'net.au', 'org.au',
  'co.jp', 'ne.jp', 'or.jp',
  'com.tw', 'org.tw', 'idv.tw',
  'com.hk', 'org.hk',
  'co.kr', 'or.kr', 'ne.kr',
];

function getPublicSuffix(domain: string): string {
  const lower = domain.toLowerCase().replace(/\.$/, '');
  const parts = lower.split('.').filter(Boolean);
  if (parts.length < 2) return parts[parts.length - 1] || '';
  const lastTwo = `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
  if (MULTI_LEVEL_TLDS.includes(lastTwo) || WHOIS_SERVERS[lastTwo]) {
    return lastTwo;
  }
  return parts[parts.length - 1];
}

async function loadRdapBootstrap(): Promise<Record<string, string>> {
  if (rdapCache) return rdapCache;

  return new Promise((resolve, reject) => {
    const req = https.get(RDAP_BOOTSTRAP, { timeout: 12000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const map: Record<string, string> = {};
          for (const entry of json.services || []) {
            const tlds: string[] = entry[0];
            const urls: string[] = entry[1];
            if (tlds?.length > 0 && urls?.length > 0) {
              for (const tld of tlds) {
                map[tld.toLowerCase()] = urls[0].replace(/\/$/, '');
              }
            }
          }
          rdapCache = map;
          resolve(map);
        } catch {
          reject(new Error('Failed to parse RDAP bootstrap'));
        }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('RDAP bootstrap timeout'));
    });
  });
}

function fetchHttps(url: string, redirects = 0): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    if (redirects > 5) {
      reject(new Error('Too many redirects'));
      return;
    }
    const req = https.get(url, {
      headers: {
        Accept: 'application/rdap+json, application/json',
        'User-Agent': 'DMHub/0.2 (domain-expiry-check)',
      },
      timeout: 12000,
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).toString();
        res.resume();
        return fetchHttps(next, redirects + 1).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode || 0, body: data }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('HTTPS timeout'));
    });
  });
}

function parseFlexibleDate(input: string): string | null {
  const raw = input.trim().replace(/["']/g, '').replace(/\s+/g, ' ');
  if (!raw) return null;

  // 去掉尾部时区括号说明
  const s = raw.replace(/\s*\(.*\)\s*$/, '').trim();

  // CNNIC / 亚洲常见：2029-07-08 12:45:09
  const cn = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (cn) {
    const y = Number(cn[1]);
    const m = Number(cn[2]);
    const d = Number(cn[3]);
    const hh = Number(cn[4] ?? 0);
    const mm = Number(cn[5] ?? 0);
    const ss = Number(cn[6] ?? 0);
    const dt = new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
    // 无时区时按本地字面理解成 UTC 可能偏移，但到期日一般按日历日够用；
    // 优先保留日期准确性：用本地构造再 toISOString
    const local = new Date(y, m - 1, d, hh, mm, ss);
    if (!isNaN(local.getTime())) return local.toISOString();
    if (!isNaN(dt.getTime())) return dt.toISOString();
  }

  // 2029/07/08 或 2029.07.08
  const slash = s.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (slash) {
    const local = new Date(
      Number(slash[1]),
      Number(slash[2]) - 1,
      Number(slash[3]),
      Number(slash[4] ?? 0),
      Number(slash[5] ?? 0),
      Number(slash[6] ?? 0),
    );
    if (!isNaN(local.getTime())) return local.toISOString();
  }

  // 08-Jul-2029 / 08-jul-2029
  const mon = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
  if (mon) {
    const parsed = new Date(`${mon[1]} ${mon[2]} ${mon[3]}`);
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
  }

  // ISO / RFC 常见格式
  const isoTry = new Date(s.includes('T') || s.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(s) ? s : s.replace(' ', 'T'));
  if (!isNaN(isoTry.getTime())) return isoTry.toISOString();

  const fallback = new Date(s);
  if (!isNaN(fallback.getTime())) return fallback.toISOString();

  return null;
}

async function queryRdap(domain: string): Promise<WhoisResult | null> {
  try {
    const suffix = getPublicSuffix(domain);
    const bootstrap = await loadRdapBootstrap();
    // 先试完整后缀（如 org.cn），再试末级（cn）
    const baseUrl =
      bootstrap[suffix] ||
      bootstrap[suffix.split('.').pop() || ''] ||
      null;
    if (!baseUrl) return null;

    const { status, body } = await fetchHttps(`${baseUrl}/domain/${encodeURIComponent(domain.toLowerCase())}`);
    if (status === 404 || status >= 500 || !body) return null;

    let json: any;
    try {
      json = JSON.parse(body);
    } catch {
      return null;
    }

    let expiresAt: string | null = null;
    let rawExpiry: string | null = null;
    let registrar: string | null = null;

    const events = json.events || [];
    for (const event of events) {
      const action = String(event.eventAction || '').toLowerCase();
      if (action === 'expiration' || action === 'expire' || action === 'expiry') {
        rawExpiry = event.eventDate || null;
        if (rawExpiry) {
          expiresAt = parseFlexibleDate(rawExpiry) || rawExpiry;
        }
      }
    }

    // 部分注册局把到期放在 remarks / status 之外的 notices，已覆盖 events
    const entities = json.entities || [];
    for (const entity of entities) {
      const roles = entity.roles || [];
      if (roles.includes('registrar')) {
        registrar =
          entity.publicIds?.[0]?.identifier ||
          entity.vcardArray?.[1]?.find((v: any[]) => v[0] === 'fn')?.[3] ||
          entity.handle ||
          null;
      }
    }

    if (expiresAt) {
      return { expiresAt, registrar, rawExpiry, source: 'rdap' };
    }

    return null;
  } catch {
    return null;
  }
}

function queryWhoisRaw(server: string, domain: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: server, port: 43 }, () => {
      // 部分服务器（如 Verisign）对 .com 需要 "domain " 前缀，CNNIC 不需要
      socket.write(domain + '\r\n');
    });

    let data = '';
    socket.on('data', (chunk) => { data += chunk.toString('utf8'); });
    socket.on('end', () => resolve(data));
    socket.on('error', reject);
    socket.setTimeout(12000, () => {
      socket.destroy();
      reject(new Error('WHOIS timeout'));
    });
  });
}

const WHOIS_SERVERS: Record<string, string> = {
  com: 'whois.verisign-grs.com',
  net: 'whois.verisign-grs.com',
  org: 'whois.pir.org',
  info: 'whois.afilias.net',
  biz: 'whois.nic.biz',
  io: 'whois.nic.io',
  co: 'whois.nic.co',
  me: 'whois.nic.me',
  cc: 'ccwhois.verisign-grs.com',
  cn: 'whois.cnnic.cn',
  'com.cn': 'whois.cnnic.cn',
  'net.cn': 'whois.cnnic.cn',
  'org.cn': 'whois.cnnic.cn',
  'gov.cn': 'whois.cnnic.cn',
  'edu.cn': 'whois.cnnic.cn',
  'ac.cn': 'whois.cnnic.cn',
  tw: 'whois.twnic.net.tw',
  'com.tw': 'whois.twnic.net.tw',
  jp: 'whois.jprs.jp',
  kr: 'whois.kr',
  uk: 'whois.nic.uk',
  'co.uk': 'whois.nic.uk',
  de: 'whois.denic.de',
  fr: 'whois.nic.fr',
  au: 'whois.auda.org.au',
  ru: 'whois.tcinet.ru',
  xyz: 'whois.nic.xyz',
  top: 'whois.nic.top',
  club: 'whois.nic.club',
  online: 'whois.nic.online',
  site: 'whois.nic.site',
  shop: 'whois.nic.shop',
  store: 'whois.nic.store',
  tech: 'whois.nic.tech',
  cloud: 'whois.nic.cloud',
  icu: 'whois.nic.icu',
  vip: 'whois.nic.vip',
  wang: 'whois.gtld.knet.cn',
  xin: 'whois.nic.xin',
  dev: 'whois.nic.google',
  app: 'whois.nic.google',
  page: 'whois.nic.google',
  ai: 'whois.nic.ai',
  gg: 'whois.gg',
  tv: 'tvwhois.verisign-grs.com',
};

/** 从 WHOIS 文本提取到期日（含 CNNIC Expiration Time 等） */
function extractExpiryFromWhois(raw: string): string | null {
  const patterns = [
    // CNNIC / 万网 / 国内常见（优先）
    /Expiration Time:\s*(.+)/i,
    /Registration Expiration Date:\s*(.+)/i,
    /Registry Expiry Date:\s*(.+)/i,
    /Registrar Registration Expiration Date:\s*(.+)/i,
    /Expiration Date:\s*(.+)/i,
    /Expiry [Dd]ate:\s*(.+)/i,
    /Expire Date:\s*(.+)/i,
    /paid-till:\s*(.+)/i,
    /DomainExpirationDate:\s*(.+)/i,
    /renewal date:\s*(.+)/i,
    /Expires on\.?:\s*(.+)/i,
    /Expires:\s*(.+)/i,
    /Record expires on\s+(.+)/i,
    /\[Expires on\]\s*(.+)/i,
    /Validity:\s*(.+)/i,
    // 中文标签
    /过期时间[：:]\s*(.+)/i,
    /到期时间[：:]\s*(.+)/i,
    /到期日[：:]\s*(.+)/i,
    /有效日期[：:]\s*(.+)/i,
    /注册到期日期[：:]\s*(.+)/i,
    /域名到期时间[：:]\s*(.+)/i,
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) {
      // 取到行尾
      const dateStr = match[1].split(/\r?\n/)[0].trim();
      const parsed = parseFlexibleDate(dateStr);
      if (parsed) return parsed;
    }
  }
  return null;
}

function extractRegistrarFromWhois(raw: string): string | null {
  const patterns = [
    /Sponsoring Registrar:\s*(.+)/i,
    /Registrar:\s*(.+)/i,
    /注册商[：:]\s*(.+)/i,
    /Registrar Name:\s*(.+)/i,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) {
      return match[1].split(/\r?\n/)[0].trim();
    }
  }
  return null;
}

function extractReferralServer(raw: string): string | null {
  const patterns = [
    /Registrar WHOIS Server:\s*(\S+)/i,
    /Whois Server:\s*(\S+)/i,
    /ReferralServer:\s*whois:\/\/(\S+)/i,
    /refer:\s*(\S+)/i,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) {
      return match[1].trim().replace(/^whois:\/\//i, '').replace(/\/$/, '');
    }
  }
  return null;
}

async function queryWhois(domain: string): Promise<WhoisResult | null> {
  const suffix = getPublicSuffix(domain);
  const server = WHOIS_SERVERS[suffix] || WHOIS_SERVERS[suffix.split('.').pop() || ''];

  if (!server) return null;

  try {
    let raw = await queryWhoisRaw(server, domain.toLowerCase());
    let expiresAt = extractExpiryFromWhois(raw);
    let registrar = extractRegistrarFromWhois(raw);
    let source = 'whois';

    // 薄 WHOIS（.com 等）常需再查注册商 WHOIS
    if (!expiresAt) {
      const referral = extractReferralServer(raw);
      if (referral && referral.toLowerCase() !== server.toLowerCase()) {
        try {
          // SSRF 防护：校验注册商 referral 服务器必须为合法公网主机
          const safe = await isPublicDomain(referral);
          if (safe) {
            raw = await queryWhoisRaw(referral, domain.toLowerCase());
            expiresAt = extractExpiryFromWhois(raw);
            registrar = extractRegistrarFromWhois(raw) || registrar;
            source = 'whois-referral';
          }
        } catch {
          // ignore referral failure
        }
      }
    }

    if (expiresAt) {
      return { expiresAt, registrar, rawExpiry: expiresAt, source };
    }
    return null;
  } catch {
    return null;
  }
}

function queryWhoisServersNet(domain: string): Promise<WhoisResult | null> {
  return new Promise((resolve) => {
    try {
      const suffix = getPublicSuffix(domain);
      // org.cn → 用 cn.whois-servers.net 或 org.cn 不一定存在，优先末级
      const hostTld = suffix.includes('.') ? suffix.split('.').pop()! : suffix;
      const host = `${hostTld}.whois-servers.net`;
      const socket = net.createConnection({ host, port: 43 }, () => {
        socket.write(domain.toLowerCase() + '\r\n');
      });
      let data = '';
      socket.on('data', (chunk) => { data += chunk.toString('utf8'); });
      socket.on('end', () => {
        const expiresAt = extractExpiryFromWhois(data);
        if (expiresAt) {
          resolve({
            expiresAt,
            registrar: extractRegistrarFromWhois(data),
            rawExpiry: expiresAt,
            source: 'whois-servers',
          });
        } else {
          resolve(null);
        }
      });
      socket.on('error', () => resolve(null));
      socket.setTimeout(12000, () => {
        socket.destroy();
        resolve(null);
      });
    } catch {
      resolve(null);
    }
  });
}

export async function lookupDomainExpiry(domain: string): Promise<WhoisResult> {
  const result: WhoisResult = { expiresAt: null, registrar: null, rawExpiry: null, source: null };
  const normalized = domain.trim().toLowerCase().replace(/\.$/, '');

  if (!isPublicDomainSync(normalized)) {
    return result;
  }

  // 1) RDAP
  const rdapResult = await queryRdap(normalized);
  if (rdapResult?.expiresAt) {
    return rdapResult;
  }

  // 2) 已知 WHOIS 服务器（含 org.cn → whois.cnnic.cn）
  const whoisResult = await queryWhois(normalized);
  if (whoisResult?.expiresAt) {
    return whoisResult;
  }

  // 3) whois-servers.net 回退
  const fallback = await queryWhoisServersNet(normalized);
  if (fallback?.expiresAt) {
    return fallback;
  }

  return result;
}

export async function previewDomainExpiry(domain: string): Promise<WhoisResult> {
  return lookupDomainExpiry(domain);
}
