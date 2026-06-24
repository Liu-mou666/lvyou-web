import { cacheGet as memGet, cacheSet as memSet, CACHE_TTL } from "./memory";

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisGet(key: string): Promise<string | null> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return null;
  try {
    const res = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: string | null };
    return data.result ?? null;
  } catch {
    return null;
  }
}

async function redisSet(key: string, value: string, ttlMs: number): Promise<void> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return;
  try {
    await fetch(`${UPSTASH_URL}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}/EX/${Math.ceil(ttlMs / 1000)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    /* fallback to memory only */
  }
}

/** 统一缓存：优先 Upstash Redis，降级进程内存 */
export async function storeGet<T>(key: string): Promise<T | null> {
  const raw = await redisGet(key);
  if (raw) {
    try {
      return JSON.parse(raw) as T;
    } catch {
      /* ignore */
    }
  }
  return memGet<T>(key);
}

export function storeGetSync<T>(key: string): T | null {
  return memGet<T>(key);
}

export async function storeSet<T>(key: string, value: T, ttlMs: number = CACHE_TTL.poi): Promise<void> {
  memSet(key, value, ttlMs);
  try {
    await redisSet(key, JSON.stringify(value), ttlMs);
  } catch {
    /* memory already set */
  }
}

export function storeSetSync<T>(key: string, value: T, ttlMs: number = CACHE_TTL.poi): void {
  memSet(key, value, ttlMs);
  void redisSet(key, JSON.stringify(value), ttlMs);
}

export { CACHE_TTL } from "./memory";
