import type { CtripHotelHit } from "./ctrip-soa-api";

const PRICE_KEYS = /^(price|minPrice|displayPrice|salePrice|afterTaxPrice|roomPrice|amount)$/i;

/** 深度扫描 JSON 中的房价字段（登录后结构多变） */
export function deepExtractPrice(obj: unknown, depth = 0): number | null {
  if (depth > 18 || obj == null) return null;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      const p = deepExtractPrice(item, depth + 1);
      if (p) return p;
    }
    return null;
  }

  if (typeof obj !== "object") return null;
  const rec = obj as Record<string, unknown>;

  for (const [k, v] of Object.entries(rec)) {
    if (PRICE_KEYS.test(k)) {
      const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
      if (n >= 30 && n <= 20000) return Math.round(n);
    }
  }
  for (const v of Object.values(rec)) {
    if (typeof v === "object") {
      const p = deepExtractPrice(v, depth + 1);
      if (p) return p;
    }
  }
  return null;
}

export function parseCtripHotelListJson(json: unknown): CtripHotelHit[] {
  const root = json as Record<string, unknown>;
  const list = (root.data as Record<string, unknown> | undefined)?.hotelList;
  if (!Array.isArray(list)) return [];

  const hits: CtripHotelHit[] = [];
  for (const item of list) {
    const rec = item as Record<string, unknown>;
    const info = (rec.hotelInfo ?? rec) as Record<string, unknown>;
    const nameInfo = info.nameInfo as Record<string, unknown> | undefined;
    const name = (nameInfo?.name ?? info.hotelName ?? rec.hotelName) as string | undefined;
    const price = deepExtractPrice(info) ?? deepExtractPrice(rec);
    const summary = info.summary as Record<string, unknown> | undefined;
    if (name && price && price > 0) {
      hits.push({
        hotelId: summary?.hotelId as number | undefined,
        name,
        price,
      });
    }
  }
  return hits;
}

/** 从当前页面可见文本提取房价（PC/H5 通用） */
export function extractPricesFromVisibleText(text: string): { name?: string; price: number }[] {
  const hits: { name?: string; price: number }[] = [];
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const priceMatch = line.match(/[¥￥]\s*(\d{2,4})(?:\s*起)?/);
    if (!priceMatch) continue;
    const price = parseInt(priceMatch[1], 10);
    if (price < 60 || price > 3000) continue;

    const nameLine = lines[i - 1] ?? lines[i];
    const name = /酒店|宾馆|客栈|民宿|如家|汉庭|全季|锦江/.test(nameLine) ? nameLine : undefined;
    hits.push({ name, price });
  }

  // 兜底：全文搜 ¥
  if (hits.length === 0) {
    for (const m of text.matchAll(/[¥￥]\s*(\d{2,4})/g)) {
      const price = parseInt(m[1], 10);
      if (price >= 60 && price <= 3000) hits.push({ price });
    }
  }

  return hits;
}

export function isLikelyCtripLoggedIn(cookies: Record<string, string>): boolean {
  return Boolean(
    cookies.cticket ||
      cookies.DUID ||
      cookies._udl ||
      cookies.login_uid ||
      cookies.IsNonUser === "F",
  );
}
