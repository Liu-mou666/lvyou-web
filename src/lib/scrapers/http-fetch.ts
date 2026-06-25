import { OTA_SCRAPE_TIMEOUT_MS, OTA_USER_AGENT } from "./config";

export async function otaFetch(url: string, init?: RequestInit): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OTA_SCRAPE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "User-Agent": OTA_USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache",
        Referer: "https://www.ctrip.com/",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      return JSON.stringify(await res.json());
    }
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
