#!/usr/bin/env npx tsx
/**
 * 本地测试 OTA 真爬（自动读 .env.local）
 * 用法：npm run scrape:test -- 苏州 汉庭酒店 320500 hotel
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { scrapeOtaPrice } from "../src/lib/scrapers/ota-scraper";

function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

async function main() {
  loadEnvLocal();
  if (!process.env.ENABLE_OTA_SCRAPE) process.env.ENABLE_OTA_SCRAPE = "true";

  const [, , city = "杭州", name = "如家酒店", adcode = "330100", type = "hotel"] = process.argv;
  const checkIn = new Date().toISOString().split("T")[0];
  console.log(`爬取 ${city} · ${name} · ${type} · ${checkIn}…`);
  console.log(`OTA_SCRAPE_MODE=${process.env.OTA_SCRAPE_MODE ?? "fetch"}`);

  const result = await scrapeOtaPrice(
    {
      id: "cli-test",
      name,
      type: type as "hotel" | "attraction",
      category: "mixed",
      lat: 0,
      lng: 0,
      durationMinutes: 120,
      cost: 0,
      pricePerPerson: 0,
      rating: 4.5,
      reviewCount: 0,
      openTime: "09:00",
      closeTime: "18:00",
      indoor: false,
      description: "",
      tips: "",
    },
    { cityName: city, adcode, checkIn },
  );

  if (result) {
    console.log("✅ 成功:", result);
  } else {
    console.log("❌ 未获取到价格");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
