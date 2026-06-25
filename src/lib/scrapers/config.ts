/** 自用 OTA 真爬开关（个人使用，勿商用） */
export function isOtaScrapeEnabled(): boolean {
  return process.env.ENABLE_OTA_SCRAPE === "true" || process.env.ENABLE_OTA_SCRAPE === "1";
}

/** playwright | fetch（默认 fetch；已安装 playwright 时酒店/门票自动用浏览器拦截 API） */
export function otaScrapeMode(): "fetch" | "playwright" {
  return process.env.OTA_SCRAPE_MODE === "playwright" ? "playwright" : "fetch";
}

let playwrightChecked = false;
let playwrightOk = false;

/** 检测本机是否已安装 Playwright 浏览器 */
export async function isPlaywrightAvailable(): Promise<boolean> {
  if (playwrightChecked) return playwrightOk;
  playwrightChecked = true;
  try {
    const pw = await import("playwright");
    const browser = await pw.chromium.launch({ headless: true });
    await browser.close();
    playwrightOk = true;
  } catch {
    playwrightOk = false;
  }
  return playwrightOk;
}

export const OTA_SCRAPE_TIMEOUT_MS = Number(process.env.OTA_SCRAPE_TIMEOUT_MS ?? 12_000);

export const OTA_USER_AGENT =
  process.env.OTA_USER_AGENT ??
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
