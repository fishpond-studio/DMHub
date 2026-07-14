/**
 * DNS 记录模板 — 常见场景一键添加
 */

export interface DnsTemplateRecord {
  recordType: string;
  name: string;
  value: string;
  ttl?: number;
  priority?: number;
  proxied?: boolean;
  remark?: string;
}

export interface DnsTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  records: DnsTemplateRecord[];
}

export const DNS_TEMPLATES: DnsTemplate[] = [
  {
    id: 'website',
    name: '建站',
    description: '将域名指向服务器 IP（A 记录 + www CNAME）',
    icon: 'globe',
    records: [
      { recordType: 'A', name: '@', value: '', ttl: 3600, remark: '主域名指向服务器IP' },
      { recordType: 'CNAME', name: 'www', value: '', ttl: 3600, remark: 'www 指向主域名（请填写你的域名）' },
    ],
  },
  {
    id: 'google',
    name: 'Google Workspace',
    description: 'Google 邮箱 + 站点验证',
    icon: 'mail',
    records: [
      { recordType: 'TXT', name: '@', value: 'google-site-verification=YOUR_VERIFICATION_CODE', ttl: 3600, remark: 'Google 站点验证' },
      { recordType: 'MX', name: '@', value: 'ASPMX.L.GOOGLE.COM', ttl: 3600, priority: 1 },
      { recordType: 'MX', name: '@', value: 'ALT1.ASPMX.L.GOOGLE.COM', ttl: 3600, priority: 5 },
      { recordType: 'MX', name: '@', value: 'ALT2.ASPMX.L.GOOGLE.COM', ttl: 3600, priority: 5 },
      { recordType: 'MX', name: '@', value: 'ASPMX2.GOOGLEMAIL.COM', ttl: 3600, priority: 10 },
      { recordType: 'MX', name: '@', value: 'ASPMX3.GOOGLEMAIL.COM', ttl: 3600, priority: 10 },
      { recordType: 'TXT', name: '@', value: 'v=spf1 include:_spf.google.com ~all', ttl: 3600, remark: 'SPF' },
    ],
  },
  {
    id: 'm365',
    name: 'Microsoft 365',
    description: 'M365 邮箱 + 域名验证',
    icon: 'mail',
    records: [
      { recordType: 'TXT', name: '@', value: 'MS=msXXXXXXXXXXXXX', ttl: 3600, remark: 'Microsoft 域名验证' },
      { recordType: 'MX', name: '@', value: '*.mail.protection.outlook.com', ttl: 3600, priority: 0, remark: '将 * 替换为你的域名前缀' },
      { recordType: 'CNAME', name: 'autodiscover', value: 'autodiscover.outlook.com', ttl: 3600 },
      { recordType: 'TXT', name: '@', value: 'v=spf1 include:spf.protection.outlook.com ~all', ttl: 3600, remark: 'SPF' },
    ],
  },
  {
    id: 'tencent-email',
    name: '腾讯企业邮箱',
    description: '腾讯企业邮箱 MX + SPF',
    icon: 'mail',
    records: [
      { recordType: 'MX', name: '@', value: 'mxbiz1.qq.com', ttl: 3600, priority: 5 },
      { recordType: 'MX', name: '@', value: 'mxbiz2.qq.com', ttl: 3600, priority: 10 },
      { recordType: 'TXT', name: '@', value: 'v=spf1 include:spf.mail.qq.com ~all', ttl: 3600, remark: 'SPF' },
      { recordType: 'CNAME', name: 'mail', value: 'exmail.qq.com', ttl: 3600 },
    ],
  },
  {
    id: 'cf-cdn',
    name: 'Cloudflare CDN',
    description: '通过 Cloudflare CDN 加速（CNAME 接入）',
    icon: 'cloud',
    records: [
      { recordType: 'CNAME', name: '@', value: '', ttl: 3600, proxied: false, remark: '指向你的 Cloudflare CNAME 目标' },
      { recordType: 'CNAME', name: 'www', value: '', ttl: 3600, proxied: false, remark: '同上' },
    ],
  },
  {
    id: 'github-pages',
    name: 'GitHub Pages',
    description: 'GitHub Pages 自定义域名',
    icon: 'code',
    records: [
      { recordType: 'A', name: '@', value: '185.199.108.153', ttl: 3600 },
      { recordType: 'A', name: '@', value: '185.199.109.153', ttl: 3600 },
      { recordType: 'A', name: '@', value: '185.199.110.153', ttl: 3600 },
      { recordType: 'A', name: '@', value: '185.199.111.153', ttl: 3600 },
      { recordType: 'CNAME', name: 'www', value: 'username.github.io', ttl: 3600, remark: '将 username 替换为你的 GitHub 用户名' },
    ],
  },
  {
    id: 'vercel',
    name: 'Vercel',
    description: 'Vercel 部署自定义域名',
    icon: 'code',
    records: [
      { recordType: 'A', name: '@', value: '76.76.21.21', ttl: 3600 },
      { recordType: 'CNAME', name: 'www', value: 'cname.vercel-dns.com', ttl: 3600 },
    ],
  },
  {
    id: 'ssl',
    name: 'SSL 证书验证',
    description: 'Let\'s Encrypt / ZeroSSL DNS 验证',
    icon: 'shield',
    records: [
      { recordType: 'TXT', name: '_acme-challenge', value: 'YOUR_CHALLENGE_VALUE', ttl: 120, remark: 'ACME DNS-01 验证' },
    ],
  },
  {
    id: 'cdn-verify',
    name: 'CDN 验证',
    description: '阿里云/腾讯云 CDN 域名验证',
    icon: 'cloud',
    records: [
      { recordType: 'TXT', name: 'verification', value: 'YOUR_VERIFICATION_CODE', ttl: 3600, remark: 'CDN 域名归属验证' },
    ],
  },
];
