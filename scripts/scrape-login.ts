#!/usr/bin/env npx tsx
/**
 * 打开可见浏览器：手动过验证码 + 登录携程账号（仅启动一个浏览器实例）
 */
process.env.ENABLE_OTA_SCRAPE = "1";

import { createInterface } from "readline";
import { existsSync, mkdirSync } from "fs";
import {
  CTRIP_USER_DATA,
  buildCtripSession,
  isCtripProfileLocked,
  profileLockHint,
} from "../src/lib/scrapers/ctrip-session";
import { resolveCtripCityId, loadCtripCityIndex } from "../src/lib/scrapers/ctrip-city-index";
import {
  launchCtripBrowser,
  openCtripLoginPage,
  prepareCtripPage,
} from "../src/lib/scrapers/ctrip-browser-launch";
import {
  extractPricesFromVisibleText,
  isLikelyCtripLoggedIn,
  parseCtripHotelListJson,
} from "../src/lib/scrapers/ctrip-price-extract";
import type { CtripHotelHit } from "../src/lib/scrapers/ctrip-soa-api";

function waitEnter(prompt: string): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

function dayAfter(s: string): string {
  const d = new Date(s);
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

async function verifyCtripPrices(
  page: Awaited<ReturnType<typeof prepareCtripPage>>,
  hotelListUrl: string,
  cityId: number,
  checkIn: string,
  checkOut: string,
): Promise<{ hit: CtripHotelHit | { name: string; price: number }; source: string } | null> {
  const apiHits: CtripHotelHit[] = [];

  const onResponse = async (response: { url: () => string; ok: () => boolean; json: () => Promise<unknown> }) => {
    if (!/fetchHotelList|getHotelList|hotelList/i.test(response.url())) return;
    if (!response.ok()) return;
    try {
      apiHits.push(...parseCtripHotelListJson(await response.json()));
    } catch {
      /* */
    }
  };

  page.on("response", onResponse);

  try {
    await page.goto(hotelListUrl, { waitUntil: "load", timeout: 45_000 });
    await page.waitForTimeout(4000);
  } catch {
    /* 用户可能已在列表页 */
  }

  page.off("response", onResponse);

  // 1. 拦截到的 API
  const apiHit = apiHits.find((h) => /如家/i.test(h.name)) ?? apiHits[0];
  if (apiHit?.price) {
    return { hit: apiHit, source: "API 拦截" };
  }

  // 2. 页面内主动调 API
  const apiJson = await page.evaluate(
    async ({ cityId, checkIn, checkOut }) => {
      const body = {
        hotelIdFilter: { hotelAldyShown: [] as string[] },
        destination: { type: 1, geo: { cityId, countryId: 1 }, keyword: { word: "如家" } },
        date: {
          dateType: 1,
          dateInfo: {
            checkInDate: checkIn.replace(/-/g, ""),
            checkOutDate: checkOut.replace(/-/g, ""),
          },
        },
        filters: [] as unknown[],
        extraFilter: { childInfoItems: [] as unknown[], sessionId: "" },
        paging: { pageCode: "102002", pageIndex: 1, pageSize: 10 },
        roomQuantity: 1,
        recommend: { nearbyHotHotel: {} },
        genk: true,
        residenceCode: "CN",
        head: {
          platform: "PC",
          cver: "hotels",
          bu: "HBU",
          group: "ctrip",
          locale: "zh-CN",
          currency: "CNY",
          pageId: "102002",
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
    { cityId, checkIn, checkOut },
  );

  const fetched = parseCtripHotelListJson(apiJson);
  const fetchedHit = fetched.find((h) => /如家/i.test(h.name)) ?? fetched[0];
  if (fetchedHit?.price) {
    return { hit: fetchedHit, source: "页面内 API" };
  }

  // 3. 从当前页面可见文字读取（用户已看到价格时最可靠）
  const visibleText = await page.evaluate(() => document.body?.innerText ?? "");
  const domHits = extractPricesFromVisibleText(visibleText);
  const domHit =
    domHits.find((h) => h.name && /如家/i.test(h.name)) ??
    domHits.find((h) => h.name) ??
    domHits[0];

  if (domHit) {
    return {
      hit: { name: domHit.name ?? "页面可见酒店", price: domHit.price },
      source: "页面可见价格",
    };
  }

  return null;
}

async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("  携程真价登录（全国通用，仅需做一次）");
  console.log("  1. 将弹出 Chrome 窗口（优先使用本机 Chrome）");
  console.log("  2. 在登录页完成验证码并登录");
  console.log("  3. 登录后打开：酒店 → 搜索「如家」→ 确认有「¥xxx起」");
  console.log("  4. 回到本窗口按回车");
  console.log("═══════════════════════════════════════════════\n");

  if (isCtripProfileLocked()) {
    console.error("❌ " + profileLockHint().replace(/\n/g, "\n   "));
    process.exit(1);
  }

  if (!existsSync(CTRIP_USER_DATA)) mkdirSync(CTRIP_USER_DATA, { recursive: true });

  let context: Awaited<ReturnType<typeof launchCtripBrowser>> | null = null;

  try {
    context = await launchCtripBrowser(false);
    const page = await prepareCtripPage(context);

    const checkIn = tomorrow();
    const checkOut = dayAfter(checkIn);
    const cityId = (await resolveCtripCityId("杭州")) ?? 17;
    const hotelListUrl = `https://hotels.ctrip.com/hotels/list?city=${cityId}&checkin=${checkIn}&checkout=${checkOut}&keyword=${encodeURIComponent("如家")}`;

    await openCtripLoginPage(page, hotelListUrl);

    console.log("✅ 浏览器已打开（携程登录页 / 酒店频道）。");
    console.log("   若仍是白屏，请在地址栏手动打开：");
    console.log(`   ${hotelListUrl}\n`);

    await waitEnter("登录完成、酒店列表能看到价格后，按回车继续… ");

    const cookies = await context.cookies();
    const cookieMap = Object.fromEntries(cookies.map((c) => [c.name, c.value]));
    const session = buildCtripSession(cookieMap);
    console.log(`✅ Cookie 已保存: ${Object.keys(session.cookies).length} 条`);
    if (isLikelyCtripLoggedIn(cookieMap)) {
      console.log("✅ 检测到登录态 Cookie（cticket/DUID）");
    }

    const index = await loadCtripCityIndex();
    console.log(`✅ 全国城市索引: ${index.length} 城/县`);

    console.log("\n正在验证房价（API + 页面可见文字）…");
    const verified = await verifyCtripPrices(page, hotelListUrl, cityId, checkIn, checkOut);

    if (verified) {
      const { hit, source } = verified;
      console.log(`\n✅ 登录验证通过（${source}）: ¥${hit.price} · ${hit.name}`);
    } else if (isLikelyCtripLoggedIn(cookieMap)) {
      console.log("\n✅ 已登录且 Cookie 已保存，可开始 npm run dev");
      console.log("   （页面有价格但 API 结构未命中，不影响后续爬取）");
    } else {
      console.warn("\n⚠ 未检测到登录态或房价，请确认已登录并能看到「¥xxx起」后重试");
    }

    console.log("\n完成。可运行 npm run dev 开始全国旅游规划。");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/has been closed|already in use|SingletonLock|another browser session/i.test(msg)) {
      console.error("❌ " + profileLockHint().replace(/\n/g, "\n   "));
    } else {
      console.error("❌", msg);
    }
    process.exit(1);
  } finally {
    if (context) await context.close();
  }
}

main();
