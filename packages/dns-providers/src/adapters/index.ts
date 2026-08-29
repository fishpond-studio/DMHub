import type { DNSProviderAdapter, ProviderCapabilities } from '../types/index.js';
import { DEFAULT_CAPABILITIES } from '../types/index.js';
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

/** 读取服务商能力（CDN 代理等） */
export function getProviderCapabilities(providerId: string | null | undefined): ProviderCapabilities {
  if (!providerId) return { ...DEFAULT_CAPABILITIES };
  const adapter = getAdapter(providerId);
  if (!adapter?.capabilities) return { ...DEFAULT_CAPABILITIES };
  return { ...DEFAULT_CAPABILITIES, ...adapter.capabilities };
}

export function listProviderMeta(): Array<{
  id: string;
  name: string;
  capabilities: ProviderCapabilities;
}> {
  return Object.values(adapters).map((a) => ({
    id: a.id,
    name: a.name,
    capabilities: getProviderCapabilities(a.id),
  }));
}
