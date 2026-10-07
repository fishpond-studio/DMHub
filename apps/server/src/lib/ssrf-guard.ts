/**
 * SSRF 防护 — 校验域名/IP 是否为公共地址
 * 阻止对私网、保留地址、元数据服务的请求
 */
import dns from 'dns';
import net from 'net';

/**
 * 将 IPv4 转换为无符号 32 位整型进行精准 CIDR 范围判断
 */
function ipToLong(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let num = 0;
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    const n = Number(p);
    if (n < 0 || n > 255) return null;
    num = (num << 8) + n;
  }
  return num >>> 0;
}

function inSubnet(ipNum: number, subnetNum: number, maskBits: number): boolean {
  const mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits)) >>> 0;
  return (ipNum & mask) === (subnetNum & mask);
}

const RESERVED_IPV4_SUBNETS: Array<{ subnet: string; bits: number }> = [
  { subnet: '0.0.0.0', bits: 8 },         // Current network (RFC 1122)
  { subnet: '10.0.0.0', bits: 8 },        // Private-Use (RFC 1918)
  { subnet: '100.64.0.0', bits: 10 },     // Shared Address Space / CGNAT (RFC 6598)
  { subnet: '127.0.0.0', bits: 8 },       // Loopback (RFC 1122)
  { subnet: '169.254.0.0', bits: 16 },    // Link Local / Cloud Metadata (RFC 3927)
  { subnet: '172.16.0.0', bits: 12 },     // Private-Use (RFC 1918)
  { subnet: '192.0.0.0', bits: 24 },      // IETF Protocol Assignments (RFC 6890)
  { subnet: '192.0.2.0', bits: 24 },      // TEST-NET-1 (RFC 5737)
  { subnet: '192.88.99.0', bits: 24 },    // 6to4 Relay Anycast (RFC 7526)
  { subnet: '192.168.0.0', bits: 16 },    // Private-Use (RFC 1918)
  { subnet: '198.18.0.0', bits: 15 },     // Benchmarking (RFC 2544)
  { subnet: '198.51.100.0', bits: 24 },   // TEST-NET-2 (RFC 5737)
  { subnet: '203.0.113.0', bits: 24 },    // TEST-NET-3 (RFC 5737)
  { subnet: '224.0.0.0', bits: 4 },       // Multicast (RFC 5771)
  { subnet: '240.0.0.0', bits: 4 },       // Reserved for future use (RFC 1112)
  { subnet: '255.255.255.255', bits: 32 },// Limited Broadcast (RFC 919)
];

const PARSED_IPV4_RANGES = RESERVED_IPV4_SUBNETS.map((r) => ({
  num: ipToLong(r.subnet)!,
  bits: r.bits,
}));

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'broadcasthost',
  'instance-data',
  'metadata.google.internal',
]);

export function isPrivateIPv4(ip: string): boolean {
  const num = ipToLong(ip);
  if (num === null) return true;
  return PARSED_IPV4_RANGES.some((range) => inSubnet(num, range.num, range.bits));
}

export function isPrivateIPv6(ip: string): boolean {
  const norm = ip.toLowerCase().trim();

  // loopback / unspecified
  if (norm === '::' || norm === '::1' || /^0+(?::0+)*(:1)?$/.test(norm)) {
    return true;
  }

  // IPv4-mapped IPv6 address (e.g. ::ffff:127.0.0.1 or ::ffff:7f00:1)
  const v4Mapped = norm.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4Mapped) {
    return isPrivateIPv4(v4Mapped[1]);
  }

  // ULA (Unique Local Address fc00::/7 -> fc00... to fdff...)
  if (/^f[cd][0-9a-f]{2}:/i.test(norm)) return true;

  // Link-Local (fe80::/10 -> fe80... to febf...)
  if (/^fe[89ab][0-9a-f]:/i.test(norm)) return true;

  // Multicast (ff00::/8)
  if (/^ff[0-9a-f]{2}:/i.test(norm)) return true;

  // Documentation prefix (2001:db8::/32)
  if (/^2001:0?db8:/i.test(norm)) return true;

  return false;
}

export function isPrivateOrReservedIP(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return true;
}

export function isValidDomain(domain: string): boolean {
  if (!domain || domain.length > 253) return false;
  // 不允许直接使用 IP 地址作为域名
  if (net.isIP(domain)) return false;
  // 基本域名格式校验
  const labels = domain.split('.');
  if (labels.length < 2) return false;
  for (const label of labels) {
    if (!label || label.length > 63) return false;
    if (!/^[a-zA-Z0-9_-]+$/.test(label)) return false;
    if (label.startsWith('-') || label.endsWith('-')) return false;
  }
  // 阻止已知危险主机名
  if (BLOCKED_HOSTNAMES.has(domain.toLowerCase())) return false;
  return true;
}

/**
 * 校验域名是否为公共域名（非私网/非保留地址）
 * 进行 DNS 解析并检查所有解析结果
 */
export async function isPublicDomain(domain: string): Promise<boolean> {
  // 如果输入是 IP 地址，直接按 IP 地址检验
  if (net.isIP(domain)) {
    return !isPrivateOrReservedIP(domain);
  }

  if (!isValidDomain(domain)) return false;

  return new Promise((resolve) => {
    dns.lookup(domain, { all: true }, (err, addresses) => {
      if (err || !addresses || addresses.length === 0) {
        resolve(false);
        return;
      }
      for (const addr of addresses) {
        if (isPrivateOrReservedIP(addr.address)) {
          resolve(false);
          return;
        }
      }
      resolve(true);
    });
  });
}

/**
 * 同步版本的域名校验（不进行 DNS 解析，仅校验格式）
 */
export function isPublicDomainSync(domain: string): boolean {
  return isValidDomain(domain);
}

/**
 * 安全 URL 验证器：校验 URL 协议必须为 http/https，主机名必须解析到公网地址
 */
export async function safeValidateUrl(
  urlString: string,
  options: { allowHttp?: boolean } = { allowHttp: true },
): Promise<{ safe: boolean; url?: URL; reason?: string }> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { safe: false, reason: 'URL 格式无效' };
  }

  if (parsed.protocol !== 'https:' && (!options.allowHttp || parsed.protocol !== 'http:')) {
    return { safe: false, reason: `仅支持 ${options.allowHttp ? 'HTTP/HTTPS' : 'HTTPS'} 协议` };
  }

  const hostname = parsed.hostname.toLowerCase();
  const safe = await isPublicDomain(hostname);
  if (!safe) {
    return { safe: false, reason: '目标地址为内网或保留地址' };
  }

  return { safe: true, url: parsed };
}

/**
 * 按 Fetch 规范准备下一跳。
 * 301/302/303 把非 GET/HEAD 改成 GET 并丢掉 body，避免把 client_secret 重放到跳转目标。
 * 跨源时去掉 Authorization 和 Cookie。
 */
function initForRedirect(currentUrl: string, nextUrl: URL, status: number, init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers);
  if (nextUrl.origin !== new URL(currentUrl).origin) {
    headers.delete('authorization');
    headers.delete('cookie');
  }

  const method = (init?.method || 'GET').toUpperCase();
  if ((status === 301 || status === 302 || status === 303) && method !== 'GET' && method !== 'HEAD') {
    headers.delete('content-type');
    headers.delete('content-length');
    const redirected: RequestInit = { ...(init ?? {}), method: 'GET', headers };
    delete redirected.body;
    return redirected;
  }

  return { ...(init ?? {}), method, headers };
}

/**
 * 解析一个公网地址并返回可直接连接的 IP。
 * 任一解析结果落在内网或保留地址时返回 null，调用方应连接返回的 IP 而不是再解析一次主机名。
 */
export async function resolvePublicAddress(hostname: string): Promise<string | null> {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (net.isIP(host)) {
    return isPrivateOrReservedIP(host) ? null : host;
  }
  if (!isValidDomain(host)) return null;

  try {
    const addresses = await dns.promises.lookup(host, { all: true });
    if (addresses.length === 0) return null;
    if (addresses.some((addr) => isPrivateOrReservedIP(addr.address))) return null;
    return addresses[0].address;
  } catch {
    return null;
  }
}

/**
 * 新建域名：格式必须合法。已经解析到内网则拒绝；DNS 尚未生效（NXDOMAIN）仍允许入库。
 */
export async function assertCreatableDomain(hostname: string): Promise<void> {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!isValidDomain(host)) {
    throw new Error('域名格式无效');
  }
  try {
    const addresses = await dns.promises.lookup(host, { all: true });
    if (addresses.some((addr) => isPrivateOrReservedIP(addr.address))) {
      throw new Error('域名不能解析到内网或保留地址');
    }
  } catch (err) {
    if (err instanceof Error && err.message === '域名不能解析到内网或保留地址') throw err;
  }
}

/**
 * 安全 fetch 封装：阻止重定向到内网地址（SSRF 防御）。
 * maxRedirects 为 0 时遇到 30x 直接拒绝，供携带密钥的请求使用。
 */
export async function safeFetch(
  urlStr: string,
  init?: RequestInit,
  maxRedirects = 3,
): Promise<Response> {
  let currentUrl = urlStr;
  let nextInit = init;
  let redirectsCount = 0;

  while (true) {
    const val = await safeValidateUrl(currentUrl);
    if (!val.safe) {
      throw new Error(`SSRF 拦截: ${val.reason || '不允许访问目标地址'} (${currentUrl})`);
    }

    const res = await fetch(currentUrl, {
      ...nextInit,
      redirect: 'manual',
    });

    if (res.status < 300 || res.status >= 400) {
      return res;
    }

    const location = res.headers.get('location');
    if (!location) {
      return res;
    }

    redirectsCount++;
    if (redirectsCount > maxRedirects) {
      throw new Error(maxRedirects === 0
        ? 'SSRF 拦截: 该请求不允许跟随重定向'
        : 'SSRF 拦截: 重定向次数过多');
    }

    const nextUrl = new URL(location, currentUrl);
    nextInit = initForRedirect(currentUrl, nextUrl, res.status, nextInit);
    currentUrl = nextUrl.toString();
    await res.body?.cancel().catch(() => {});
  }
}
