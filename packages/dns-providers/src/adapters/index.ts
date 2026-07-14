import type { DNSProviderAdapter } from '../types/index.js';
import { AliyunAdapter } from './aliyun.js';
import { CloudflareAdapter } from './cloudflare.js';
import { TencentAdapter } from './tencent.js';

export { AliyunAdapter } from './aliyun.js';
export { CloudflareAdapter } from './cloudflare.js';
export { TencentAdapter } from './tencent.js';

const adapters: Record<string, DNSProviderAdapter> = {
  cloudflare: new CloudflareAdapter(),
  aliyun: new AliyunAdapter(),
  tencent: new TencentAdapter(),
};

export function getAdapter(providerId: string): DNSProviderAdapter | null {
  return adapters[providerId] ?? null;
}
