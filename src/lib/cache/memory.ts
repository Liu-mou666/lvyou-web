const store = new Map<string, { value: unknown; expires: number }>();

export function cacheGet<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    store.delete(key);
    return null;
  }
  return entry.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { value, expires: Date.now() + ttlMs });
}

/** 常用 TTL */
export const CACHE_TTL = {
  poi: 6 * 60 * 60 * 1000,
  route: 2 * 60 * 60 * 1000,
  weather: 30 * 60 * 1000,
  staticMap: 60 * 60 * 1000,
} as const;

export function cacheKey(parts: string[]): string {
  return parts.join(":");
}
