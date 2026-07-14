import net from 'net';
import https from 'https';
import { isPublicDomainSync } from './ssrf-guard.js';

interface WhoisResult {
  expiresAt: string | null;
  registrar: string | null;
  rawExpiry: string | null;
}

const RDAP_BOOTSTRAP = 'https://data.iana.org/rdap/dns.json';

let rdapCache: Record<string, string> | null = null;

async function loadRdapBootstrap(): Promise<Record<string, string>> {
  if (rdapCache) return rdapCache;

  return new Promise((resolve, reject) => {
    https.get(RDAP_BOOTSTRAP, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const map: Record<string, string> = {};
          for (const entry of json.services) {
            const tlds: string[] = entry[0];
            const urls: string[] = entry[1];
            if (tlds.length > 0 && urls.length > 0) {
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
    }).on('error', reject);
  });
}

function fetchHttps(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { Accept: 'application/rdap+json, application/json' },
      timeout: 10000,
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchHttps(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function queryRdap(domain: string): Promise<WhoisResult | null> {
  try {
    const parts = domain.split('.');
    const tld = parts[parts.length - 1].toLowerCase();
    const bootstrap = await loadRdapBootstrap();
    const baseUrl = bootstrap[tld];
    if (!baseUrl) return null;

    const body = await fetchHttps(`${baseUrl}/domain/${encodeURIComponent(domain)}`);
    const json = JSON.parse(body);

    let expiresAt: string | null = null;
    let rawExpiry: string | null = null;
    let registrar: string | null = null;

    const events = json.events || [];
    for (const event of events) {
      if (event.eventAction === 'expiration') {
        rawExpiry = event.eventDate || null;
        if (rawExpiry) {
          expiresAt = rawExpiry;
        }
      }
    }

    const entities = json.entities || [];
    for (const entity of entities) {
      const roles = entity.roles || [];
      if (roles.includes('registrar')) {
        registrar = entity.publicIds?.[0]?.identifier || entity.vcardArray?.[1]?.find((v: any[]) => v[0] === 'fn')?.[3] || null;
      }
    }

    if (expiresAt) {
      return { expiresAt, registrar, rawExpiry };
    }

    return null;
  } catch {
    return null;
  }
}

function queryWhoisRaw(server: string, domain: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: server, port: 43 }, () => {
      socket.write(domain + '\r\n');
    });

    let data = '';
    socket.on('data', (chunk) => { data += chunk; });
    socket.on('end', () => resolve(data));
    socket.on('error', reject);
    socket.setTimeout(10000, () => { socket.destroy(); reject(new Error('WHOIS timeout')); });
  });
}

const WHOIS_SERVERS: Record<string, string> = {
  com: 'whois.verisign-grs.com',
  net: 'whois.verisign-grs.com',
  org: 'whois.pir.org',
  info: 'whois.afilias.net',
  io: 'whois.nic.io',
  co: 'whois.nic.co',
  me: 'whois.nic.me',
  cc: 'ccwhois.verisign-grs.com',
  cn: 'whois.cnnic.cn',
  'com.cn': 'whois.cnnic.cn',
  'net.cn': 'whois.cnnic.cn',
  'org.cn': 'whois.cnnic.cn',
  tw: 'whois.twnic.net.tw',
  jp: 'whois.jprs.jp',
  kr: 'whois.kr',
  uk: 'whois.nic.uk',
  de: 'whois.denic.de',
  fr: 'whois.nic.fr',
  au: 'whois.auda.org.au',
  ru: 'whois.tcinet.ru',
  xyz: 'whois.nic.xyz',
  top: 'whois.nic.top',
  club: 'whois.nic.club',
  online: 'whois.nic.online',
  site: 'whois.nic.site',
  dev: 'whois.nic.google',
  app: 'whois.nic.google',
  page: 'whois.nic.google',
};

function extractExpiryFromWhois(raw: string): string | null {
  const patterns = [
    /Registry Expiry Date:\s*(.+)/i,
    /Registrar Registration Expiration Date:\s*(.+)/i,
    /Expiration Date:\s*(.+)/i,
    /Expiry date:\s*(.+)/i,
    /Expiry Date:\s*(.+)/i,
    /paid-till:\s*(.+)/i,
    /Registry Expiry Date:\s*(.+)/i,
    /DomainExpirationDate:\s*(.+)/i,
    /renewal date:\s*(.+)/i,
    /Expires on\.*:\s*(.+)/i,
    /Expires:\s*(.+)/i,
    /Expire Date:\s*(.+)/i,
    /Record expires on\s+(.+)/i,
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) {
      const dateStr = match[1].trim();
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }
  }
  return null;
}

async function queryWhois(domain: string): Promise<WhoisResult | null> {
  const parts = domain.split('.');
  const tld = parts[parts.length - 1].toLowerCase();
  const secondLevel = parts.length >= 2 ? `${parts[parts.length - 2]}.${tld}` : '';
  const server = WHOIS_SERVERS[secondLevel] || WHOIS_SERVERS[tld];

  if (!server) return null;

  try {
    const raw = await queryWhoisRaw(server, domain);
    const expiresAt = extractExpiryFromWhois(raw);

    let registrar: string | null = null;
    const registrarMatch = raw.match(/Registrar:\s*(.+)/i);
    if (registrarMatch?.[1]) {
      registrar = registrarMatch[1].trim();
    }

    if (expiresAt) {
      return { expiresAt, registrar, rawExpiry: expiresAt };
    }
    return null;
  } catch {
    return null;
  }
}

function queryDnsSoa(domain: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const parts = domain.split('.');
      const tld = parts[parts.length - 1];
      const socket = net.createConnection({ host: `${tld}.whois-servers.net`, port: 43 }, () => {
        socket.write(domain + '\r\n');
      });
      let data = '';
      socket.on('data', (chunk) => { data += chunk; });
      socket.on('end', () => {
        const expiry = extractExpiryFromWhois(data);
        resolve(expiry);
      });
      socket.on('error', () => resolve(null));
      socket.setTimeout(10000, () => { socket.destroy(); resolve(null); });
    } catch {
      resolve(null);
    }
  });
}

export async function lookupDomainExpiry(domain: string): Promise<WhoisResult> {
  const result: WhoisResult = { expiresAt: null, registrar: null, rawExpiry: null };

  // SSRF 防护：校验域名格式
  if (!isPublicDomainSync(domain)) {
    return result;
  }

  const rdapResult = await queryRdap(domain);
  if (rdapResult?.expiresAt) {
    return rdapResult;
  }

  const whoisResult = await queryWhois(domain);
  if (whoisResult?.expiresAt) {
    return whoisResult;
  }

  const soaExpiry = await queryDnsSoa(domain);
  if (soaExpiry) {
    result.expiresAt = soaExpiry;
    result.rawExpiry = soaExpiry;
  }

  return result;
}

export async function previewDomainExpiry(domain: string): Promise<WhoisResult> {
  return lookupDomainExpiry(domain);
}
