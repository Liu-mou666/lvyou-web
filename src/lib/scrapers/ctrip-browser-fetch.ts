import { OTA_SCRAPE_TIMEOUT_MS } from "./config";
import type { CtripHotelHit } from "./ctrip-soa-api";
import { pickBestCtripHotel } from "./ctrip-soa-api";

import { launchCtripBrowser, prepareCtripPage } from "./ctrip-browser-launch";
import { parseCtripHotelListJson } from "./ctrip-price-extract";

function formatYmd(d: string): string {
  return d.replace(/-/g, "");
}

/** 在持久化浏览器内 fetch SOA（自动带 Cookie/指纹） */
export async function fetchCtripHotelsInBrowser(
  cityId: number,
  keyword: string,
  checkIn: string,
  checkOut: string,
): Promise<CtripHotelHit[]> {
  try {
    const context = await launchCtripBrowser(true);

    try {
      const page = await prepareCtripPage(context);

      const listUrl = `https://m.ctrip.com/webapp/hotel/hotellist?city=${cityId}&keyword=${encodeURIComponent(keyword)}&checkin=${checkIn}&checkout=${checkOut}`;
      const hits: CtripHotelHit[] = [];

      page.on("response", async (response) => {
        if (!response.url().includes("fetchHotelList")) return;
        try {
          const json = await response.json();
          hits.push(...parseCtripHotelListJson(json));
        } catch {
          /* */
        }
      });

      await page.goto(listUrl, {
        waitUntil: "networkidle",
        timeout: OTA_SCRAPE_TIMEOUT_MS,
      });
      await page.waitForTimeout(5000);

      if (hits.length > 0) return hits;

      // 兜底：页面内主动调 API
      const json = await page.evaluate(
        async ({ cityId, keyword, checkIn, checkOut }) => {
          const body = {
            hotelIdFilter: { hotelAldyShown: [] as string[] },
            destination: { type: 1, geo: { cityId, countryId: 1 }, keyword: { word: keyword } },
            date: {
              dateType: 1,
              dateInfo: { checkInDate: checkIn, checkOutDate: checkOut },
            },
            filters: [] as unknown[],
            extraFilter: { childInfoItems: [] as unknown[], sessionId: "" },
            paging: { pageCode: "102002", pageIndex: 1, pageSize: 15 },
            roomQuantity: 1,
            recommend: { nearbyHotHotel: {} },
            genk: true,
            residenceCode: "CN",
            head: {
              platform: "H5",
              cver: "999999",
              bu: "HBU",
              group: "ctrip",
              locale: "zh-CN",
              timezone: "8",
              currency: "CNY",
              pageId: "212094",
              isSSR: false,
            },
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
        { cityId, keyword, checkIn: formatYmd(checkIn), checkOut: formatYmd(checkOut) },
      );

      if (process.env.DEBUG_CTRIP === "1") {
        console.log("[debug] soa:", JSON.stringify(json).slice(0, 2000));
      }

      return parseCtripHotelListJson(json);
    } finally {
      await context.close();
    }
  } catch (err) {
    console.warn("[ota] in-browser fetch:", err instanceof Error ? err.message : err);
    return [];
  }
}

export async function searchCtripHotelInBrowser(
  cityId: number,
  keyword: string,
  checkIn: string,
  checkOut: string,
): Promise<CtripHotelHit | null> {
  const hits = await fetchCtripHotelsInBrowser(cityId, keyword, checkIn, checkOut);
  return pickBestCtripHotel(hits, keyword);
}
