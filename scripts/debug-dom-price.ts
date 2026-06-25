import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { resolveCtripCityId } from "../src/lib/scrapers/ctrip-city-index";
import { OTA_SCRAPE_TIMEOUT_MS, OTA_USER_AGENT } from "../src/lib/scrapers/config";

async function main() {
  const pw = await import("playwright");
  const USER_DATA = join(process.cwd(), ".cache", "ctrip-browser");
  if (!existsSync(USER_DATA)) mkdirSync(USER_DATA, { recursive: true });
  const cityId = await resolveCtripCityId("杭州");
  const checkIn = "2026-06-26";
  const checkOut = "2026-06-27";
  const kw = "如家";
  const url = `https://m.ctrip.com/webapp/hotel/hotellist?city=${cityId}&keyword=${encodeURIComponent(kw)}&checkin=${checkIn}&checkout=${checkOut}`;

  const ctx = await pw.chromium.launchPersistentContext(USER_DATA, { headless: true, userAgent: OTA_USER_AGENT });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(url, { waitUntil: "networkidle", timeout: OTA_SCRAPE_TIMEOUT_MS });
  await page.waitForTimeout(5000);
  const text = await page.content();
  const prices = [...text.matchAll(/¥\s*(\d{2,4})/g)].map((m) => parseInt(m[1], 10)).filter((n) => n >= 60 && n <= 800);
  console.log("prices in DOM:", [...new Set(prices)].slice(0, 20));
  console.log("has login hint:", /登录.*会员价/.test(text));
  await ctx.close();
}

main();
