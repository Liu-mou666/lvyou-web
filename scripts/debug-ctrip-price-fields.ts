import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { resolveCtripCityId } from "../src/lib/scrapers/ctrip-city-index";
import { OTA_SCRAPE_TIMEOUT_MS, OTA_USER_AGENT } from "../src/lib/scrapers/config";

function walk(obj: unknown, path: string, out: string[]) {
  if (obj == null || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => walk(v, `${path}[${i}]`, out));
    return;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const p = path ? `${path}.${k}` : k;
    if (/price|amount|cost|fee/i.test(k) && (typeof v === "number" || typeof v === "string")) {
      out.push(`${p}=${v}`);
    }
    if (typeof v === "object") walk(v, p, out);
  }
}

async function main() {
  const pw = await import("playwright");
  const USER_DATA = join(process.cwd(), ".cache", "ctrip-browser");
  if (!existsSync(USER_DATA)) mkdirSync(USER_DATA, { recursive: true });
  const cityId = (await resolveCtripCityId("杭州"))!;
  const ctx = await pw.chromium.launchPersistentContext(USER_DATA, { headless: true, userAgent: OTA_USER_AGENT });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto("https://m.ctrip.com/webapp/hotel/", { waitUntil: "domcontentloaded", timeout: OTA_SCRAPE_TIMEOUT_MS });
  await page.waitForTimeout(1000);

  const json = await page.evaluate(
    async ({ cityId }) => {
      const body = {
        hotelIdFilter: { hotelAldyShown: [] },
        destination: { type: 1, geo: { cityId, countryId: 1 }, keyword: { word: "如家" } },
        date: { dateType: 1, dateInfo: { checkInDate: "20260626", checkOutDate: "20260627" } },
        filters: [],
        extraFilter: { childInfoItems: [], sessionId: "" },
        paging: { pageCode: "102002", pageIndex: 1, pageSize: 3 },
        roomQuantity: 1,
        recommend: { nearbyHotHotel: {} },
        genk: true,
        residenceCode: "CN",
        head: { platform: "H5", cver: "999999", bu: "HBU", group: "ctrip", locale: "zh-CN", timezone: "8", currency: "CNY", pageId: "212094", isSSR: false },
        ServerData: "",
      };
      const res = await fetch("https://m.ctrip.com/restapi/soa2/31454/json/fetchHotelList", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      return res.json();
    },
    { cityId },
  );

  const list = (json as { data?: { hotelList?: unknown[] } }).data?.hotelList ?? [];
  console.log("hotels", list.length);
  for (let i = 0; i < Math.min(2, list.length); i++) {
    const found: string[] = [];
    walk(list[i], `hotel[${i}]`, found);
    console.log(`--- hotel ${i} price fields ---`);
    console.log(found.join("\n") || "(none)");
    const name = (list[i] as { hotelInfo?: { nameInfo?: { name?: string } } }).hotelInfo?.nameInfo?.name;
    console.log("name:", name);
  }
  await ctx.close();
}

main();
