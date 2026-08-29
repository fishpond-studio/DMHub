import Redis from 'ioredis';
import { config } from '../config/index.js';

/**
 * 统一缓存抽象：配置了 REDIS_URL（环境变量或团队设置）时使用 Redis，
 * 否则回退到进程内存。所有 value 为字符串，调用方自行 JSON 序列化。
 */

const KEY_PREFIX = 'dmhub:';

interface MemoryEntry {
  value: string;
  expiresAt: number | null;
}

const memoryStore = new Map<string, MemoryEntry>();

let redisUrl: string | null = null;
let redis: Redis | null = null;
let redisBroken = false;
let nextRetryAt = 0;

export function configureCache(url?: string | null): void {
  const next = url?.trim() || null;
  if (next === redisUrl) return;
  redisUrl = next;
  redisBroken = false;
  nextRetryAt = 0;
  if (redis) {
    const old = redis;
    redis = null;
    old.disconnect();
  }
}

export function initCacheFromEnv(): void {
  if (config.REDIS_URL) configureCache(config.REDIS_URL);
}

export function getCacheBackend(): 'redis' | 'memory' {
  return redis ? 'redis' : 'memory';
}

async function getRedis(): Promise<Redis | null> {
  if (!redisUrl || redisBroken && Date.now() < nextRetryAt) return redis;
  if (redis) return redis;
  try {
    const client = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 3000,
      retryStrategy: () => null,
    });
    client.on('error', () => {});
    await client.connect();
    redis = client;
    redisBroken = false;
    console.log('[Cache] Connected to Redis');
    return redis;
  } catch {
    redisBroken = true;
    nextRetryAt = Date.now() + 30_000;
    return null;
  }
}

function memorySweep(): void {
  const now = Date.now();
  for (const [key, entry] of memoryStore) {
    if (entry.expiresAt !== null && now > entry.expiresAt) memoryStore.delete(key);
  }
}
setInterval(memorySweep, 60_000);

async function withRedis<T>(fn: (client: Redis) => Promise<T>): Promise<T | null> {
  const client = await getRedis();
  if (!client) return null;
  try {
    return await fn(client);
  } catch {
    redisBroken = true;
    nextRetryAt = Date.now() + 30_000;
    const broken = redis;
    redis = null;
    broken?.disconnect();
    return null;
  }
}

export async function cacheGet(key: string): Promise<string | null> {
  const k = KEY_PREFIX + key;
  const fromRedis = await withRedis((c) => c.get(k));
  if (fromRedis !== null) return fromRedis;
  if (redis) return null;
  const entry = memoryStore.get(k);
  if (!entry) return null;
  if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
    memoryStore.delete(k);
    return null;
  }
  return entry.value;
}

export async function cacheSet(key: string, value: string, ttlSeconds?: number): Promise<void> {
  const k = KEY_PREFIX + key;
  const done = await withRedis(async (c) => {
    if (ttlSeconds && ttlSeconds > 0) await c.set(k, value, 'EX', ttlSeconds);
    else await c.set(k, value);
  });
  if (done !== null || redis) return;
  memoryStore.set(k, {
    value,
    expiresAt: ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null,
  });
}

export async function cacheDel(key: string): Promise<void> {
  const k = KEY_PREFIX + key;
  await withRedis((c) => c.del(k));
  memoryStore.delete(k);
}

/** 原子自增并设置 TTL，返回自增后的值（用于速率限制计数） */
export async function cacheIncr(key: string, ttlSeconds: number): Promise<number> {
  const k = KEY_PREFIX + key;
  const fromRedis = await withRedis(async (c) => {
    const n = await c.incr(k);
    if (n === 1) await c.expire(k, ttlSeconds);
    return n;
  });
  if (fromRedis !== null) return fromRedis;
  if (redis) return Number.MAX_SAFE_INTEGER;
  const entry = memoryStore.get(k);
  const now = Date.now();
  if (!entry || (entry.expiresAt !== null && now > entry.expiresAt)) {
    memoryStore.set(k, { value: '1', expiresAt: now + ttlSeconds * 1000 });
    return 1;
  }
  const n = parseInt(entry.value, 10) + 1;
  entry.value = String(n);
  return n;
}

/** 列出指定前缀的 key（去掉全局前缀），用于扫描型存储 */
export async function cacheKeys(prefix: string): Promise<string[]> {
  const pattern = KEY_PREFIX + prefix;
  const fromRedis = await withRedis(async (c) => {
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [next, batch] = await c.scan(cursor, 'MATCH', `${pattern}*`, 'COUNT', 200);
      cursor = next;
      keys.push(...batch);
    } while (cursor !== '0');
    return keys;
  });
  if (fromRedis !== null) return fromRedis.map((k) => k.slice(KEY_PREFIX.length));
  if (redis) return [];
  memorySweep();
  const result: string[] = [];
  for (const k of memoryStore.keys()) {
    if (k.startsWith(pattern)) result.push(k.slice(KEY_PREFIX.length));
  }
  return result;
}

export async function closeCache(): Promise<void> {
  if (redis) {
    const old = redis;
    redis = null;
    old.disconnect();
  }
}
