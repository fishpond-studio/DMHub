/**
 * SSRF 防护 — 校验域名/IP 是否为公共地址
 * 阻止对私网、保留地址的请求
 */
import dns from 'dns';
import net from 'net';

const PRIVATE_IP_RANGES = [
  // 10.0.0.0/8
  /^10\./,
  // 172.16.0.0/12
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  // 192.168.0.0/16
  /^192\.168\./,
  // 127.0.0.0/8 (loopback)
  /^127\./,
  // 169.254.0.0/16 (link-local)
  /^169\.254\./,
  // 0.0.0.0/8
  /^0\./,
  // 100.64.0.0/10 (CGNAT)
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

const IPV6_PRIVATE_PATTERNS = [
  /^::1$/,           // loopback
  /^fc00:/i,         // ULA
  /^fd/i,            // ULA
  /^fe80:/i,         // link-local
  /^::ffff:0{0,3}:10\./i,  // IPv4-mapped 10.x
  /^::ffff:0{0,3}:192\.168\./i,
  /^::ffff:0{0,3}:172\./i,
  /^::ffff:0{0,3}:127\./i,
];

const BLOCKED_HOSTNAMES = [
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'broadcasthost',
];

export function isPrivateIPv4(ip: string): boolean {
  return PRIVATE_IP_RANGES.some((re) => re.test(ip));
}

export function isPrivateIPv6(ip: string): boolean {
  return IPV6_PRIVATE_PATTERNS.some((re) => re.test(ip));
}

export function isPrivateOrReservedIP(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return false;
}

export function isValidDomain(domain: string): boolean {
  if (!domain || domain.length > 253) return false;
  // 不允许 IP 地址作为域名
  if (net.isIP(domain)) return false;
  // 基本域名格式校验
  const labels = domain.split('.');
  if (labels.length < 2) return false;
  for (const label of labels) {
    if (!label || label.length > 63) return false;
    if (!/^[a-zA-Z0-9_-]+$/.test(label)) return false;
  }
  // 阻止已知危险主机名
  if (BLOCKED_HOSTNAMES.includes(domain.toLowerCase())) return false;
  return true;
}

/**
 * 校验域名是否为公共域名（非私网/非保留地址）
 * 会进行 DNS 解析并检查解析结果
 */
export async function isPublicDomain(domain: string): Promise<boolean> {
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
