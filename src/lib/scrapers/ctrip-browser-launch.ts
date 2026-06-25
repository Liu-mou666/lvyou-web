import { existsSync, mkdirSync } from "fs";
import { OTA_USER_AGENT } from "./config";
import { CTRIP_USER_DATA } from "./ctrip-session";

type PlaywrightModule = typeof import("playwright");

/** 启动可见浏览器（优先本机 Chrome，避免 H5 白屏） */
export async function launchCtripBrowser(headless = false) {
  const pw = await import("playwright");
  if (!existsSync(CTRIP_USER_DATA)) mkdirSync(CTRIP_USER_DATA, { recursive: true });

  const baseOpts = {
    headless,
    locale: "zh-CN" as const,
    viewport: headless ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    userAgent: headless
      ? OTA_USER_AGENT
      : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-dev-shm-usage",
    ],
    extraHTTPHeaders: { "Accept-Language": "zh-CN,zh;q=0.9" },
    ignoreHTTPSErrors: true,
  };

  // 本机 Chrome 渲染携程最稳；没有则退回 Playwright Chromium
  for (const channel of ["chrome", "msedge", undefined] as const) {
    try {
      return await pw.chromium.launchPersistentContext(CTRIP_USER_DATA, {
        ...baseOpts,
        ...(channel ? { channel } : {}),
      });
    } catch {
      /* try next */
    }
  }

  throw new Error("无法启动浏览器，请安装 Google Chrome 后重试");
}

export async function prepareCtripPage(context: Awaited<ReturnType<PlaywrightModule["chromium"]["launchPersistentContext"]>>) {
  const page = context.pages()[0] ?? (await context.newPage());
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });
  return page;
}

/** 预热并打开携程登录页（PC 版，避免移动 H5 白屏） */
export async function openCtripLoginPage(
  page: Awaited<ReturnType<typeof prepareCtripPage>>,
  backUrl = "https://www.ctrip.com/",
) {
  const loginUrl = `https://passport.ctrip.com/user/login?backurl=${encodeURIComponent(backUrl)}`;

  try {
    await page.goto("https://www.ctrip.com/", { waitUntil: "load", timeout: 45_000 });
    await page.waitForTimeout(2000);
  } catch {
    /* 首页失败仍尝试登录页 */
  }

  await page.goto(loginUrl, { waitUntil: "load", timeout: 45_000 });
  await page.waitForTimeout(1500);

  const blank = (await page.content()).length < 500;
  if (blank) {
    // 兜底：PC 酒店频道
    await page.goto("https://hotels.ctrip.com/", { waitUntil: "load", timeout: 45_000 });
  }
}
