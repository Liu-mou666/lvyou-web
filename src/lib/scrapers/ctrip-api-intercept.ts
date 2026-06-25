import { OTA_SCRAPE_TIMEOUT_MS } from "./config";
import { nameSimilarity } from "./html-parse";
import { launchCtripBrowser, prepareCtripPage } from "./ctrip-browser-launch";

interface InterceptHit {
  price: number;
  title?: string;
}

function collectPricesFromJson(obj: unknown, out: InterceptHit[], keyword: string, depth = 0): void {
  if (depth > 12 || obj == null) return;
  if (Array.isArray(obj)) {
    for (const item of obj) collectPricesFromJson(item, out, keyword, depth + 1);
    return;
  }
  if (typeof obj !== "object") return;
  const rec = obj as Record<string, unknown>;
  const title =
    (typeof rec.hotelName === "string" && rec.hotelName) ||
    (typeof rec.name === "string" && rec.name) ||
    (typeof rec.poiName === "string" && rec.poiName) ||
    (typeof rec.scenicName === "string" && rec.scenicName) ||
    (typeof rec.productName === "string" && rec.productName) ||
    undefined;
  const priceRaw =
    rec.price ?? rec.minPrice ?? rec.lowestPrice ?? rec.salePrice ?? rec.displayPrice ?? rec.startPrice;
  const price = typeof priceRaw === "number" ? priceRaw : parseFloat(String(priceRaw ?? "0"));
  if (title && price >= 20 && price <= 8000 && nameSimilarity(keyword, title) >= 0.35) {
    out.push({ price: Math.round(price), title });
  }
  for (const v of Object.values(rec)) {
    if (typeof v === "object") collectPricesFromJson(v, out, keyword, depth + 1);
  }
}

/** 用持久化浏览器上下文拦截携程 API（复用已登录/已过验证码的 Cookie） */
export async function interceptCtripPrices(
  url: string,
  keyword: string,
  waitMs = 8000,
): Promise<InterceptHit | null> {
  try {
    const context = await launchCtripBrowser(true);
    const hits: InterceptHit[] = [];

    try {
      const page = await prepareCtripPage(context);

      page.on("response", async (response) => {
        const u = response.url();
        if (!/ctrip\.com\/restapi\/soa2|sec-m\.ctrip\.com\/restapi/.test(u)) return;
        if (!response.ok()) return;
        try {
          const json = await response.json();
          collectPricesFromJson(json, hits, keyword);
        } catch {
          /* */
        }
      });

      await page.goto(url, { waitUntil: "networkidle", timeout: OTA_SCRAPE_TIMEOUT_MS });
      await page.waitForTimeout(waitMs);

      if (hits.length === 0) {
        const text = await page.content();
        if (/captcha|Captcha|verify/i.test(text)) {
          console.warn("[ota] 携程验证码：请运行 npm run scrape:login 完成一次人工验证");
        }
      }
    } finally {
      await context.close();
    }

    if (hits.length === 0) return null;
    hits.sort((a, b) => {
      const sa = a.title ? nameSimilarity(keyword, a.title) : 0.2;
      const sb = b.title ? nameSimilarity(keyword, b.title) : 0.2;
      if (sb !== sa) return sb - sa;
      return a.price - b.price;
    });
    return hits[0];
  } catch (err) {
    console.warn("[ota] playwright error:", err instanceof Error ? err.message : err);
    return null;
  }
}
