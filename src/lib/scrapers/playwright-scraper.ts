import { OTA_SCRAPE_TIMEOUT_MS } from "./config";

/** 本地 Playwright 真浏览器爬取（需安装 playwright，Vercel 不可用） */
export async function scrapeHtmlWithPlaywright(url: string): Promise<string | null> {
  try {
    const pw = await import("playwright");
    const browser = await pw.chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        locale: "zh-CN",
      });
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: OTA_SCRAPE_TIMEOUT_MS });
      await page.waitForTimeout(1500);
      return await page.content();
    } finally {
      await browser.close();
    }
  } catch {
    return null;
  }
}
