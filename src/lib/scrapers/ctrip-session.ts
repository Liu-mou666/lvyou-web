import { existsSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";
import { OTA_SCRAPE_TIMEOUT_MS } from "./config";
import { launchCtripBrowser, prepareCtripPage } from "./ctrip-browser-launch";

export interface CtripSession {
  cookies: Record<string, string>;
  cookieHeader: string;
  cid: string;
  guid: string;
  vid: string;
}

/** 携程持久化浏览器配置目录（全局唯一，不可同时开两个实例） */
export const CTRIP_USER_DATA = join(process.cwd(), ".cache", "ctrip-browser");

function randomId(len = 17): string {
  let s = "";
  for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 10);
  return s;
}

function parseCookies(cookieList: { name: string; value: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of cookieList) out[c.name] = c.value;
  return out;
}

export function buildCtripSession(cookies: Record<string, string>): CtripSession {
  const cid = cookies.GUID ?? cookies.guid ?? randomId();
  const guid = cookies.GUID ?? cid;
  const vid = cookies.vid ?? `${Date.now()}.${randomId(8)}`;
  return {
    cookies,
    cookieHeader: Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; "),
    cid,
    guid,
    vid,
  };
}

function hasUsableCookies(cookies: Record<string, string>): boolean {
  return Boolean(cookies.GUID || cookies._bfa || cookies.UBT_VID || Object.keys(cookies).length >= 8);
}

/** 配置目录是否可能被其他 Chromium 实例占用 */
export function isCtripProfileLocked(): boolean {
  const lockFile = join(CTRIP_USER_DATA, "SingletonLock");
  const cookieFile = join(CTRIP_USER_DATA, "SingletonCookie");
  if (!existsSync(lockFile) && !existsSync(cookieFile)) return false;
  try {
    if (existsSync(lockFile)) {
      const content = readFileSync(lockFile, "utf8");
      // 锁文件存在且非空，通常表示有实例在跑
      return content.trim().length > 0;
    }
  } catch {
    return true;
  }
  return existsSync(cookieFile);
}

export function profileLockHint(): string {
  return [
    "携程浏览器配置目录正被占用（不能同时开两个窗口）。",
    "请：",
    "  1. 关闭之前 scrape:login 弹出的 Chrome 窗口",
    "  2. 打开任务管理器，结束来自 ms-playwright 目录的 chrome.exe",
    "  3. 或双击运行 kill-ctrip-browser.cmd",
    "  4. 再重新执行 npm run scrape:login",
  ].join("\n");
}

function isProfileInUseError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /has been closed|already in use|SingletonLock|another browser session|Target page, context or browser/i.test(
    msg,
  );
}

let sessionCache: { at: number; session: CtripSession } | null = null;
const SESSION_TTL_MS = 20 * 60 * 1000;

/** 持久化浏览器会话：headless 复用 Cookie；登录请用 npm run scrape:login */
export async function getCtripSession(): Promise<CtripSession | null> {
  if (sessionCache && Date.now() - sessionCache.at < SESSION_TTL_MS) {
    return sessionCache.session;
  }

  if (isCtripProfileLocked()) {
    console.warn("[ota]", profileLockHint());
    return null;
  }

  try {
    const context = await launchCtripBrowser(true);

    try {
      const page = await prepareCtripPage(context);

      let cookies = parseCookies(await context.cookies("https://m.ctrip.com"));
      if (hasUsableCookies(cookies)) {
        const session = buildCtripSession(cookies);
        sessionCache = { at: Date.now(), session };
        return session;
      }

      await page.goto("https://m.ctrip.com/webapp/hotel/", {
        waitUntil: "domcontentloaded",
        timeout: OTA_SCRAPE_TIMEOUT_MS,
      });
      await page.waitForTimeout(1200);

      cookies = parseCookies(await context.cookies("https://m.ctrip.com"));
      if (!hasUsableCookies(cookies)) {
        console.warn("[ota] 携程未登录：请运行 npm run scrape:login");
        return null;
      }

      const session = buildCtripSession(cookies);
      sessionCache = { at: Date.now(), session };
      return session;
    } finally {
      await context.close();
    }
  } catch (err) {
    if (isProfileInUseError(err)) {
      console.warn("[ota]", profileLockHint());
    } else {
      console.warn("[ota] session error:", err instanceof Error ? err.message : err);
    }
    return null;
  }
}
