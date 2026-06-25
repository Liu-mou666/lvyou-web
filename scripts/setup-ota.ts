#!/usr/bin/env npx tsx
/**
 * 一键配置 OTA 真爬（全国城市，非仅苏州）
 */
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";

const envPath = resolve(process.cwd(), ".env.local");
const lines: string[] = existsSync(envPath) ? readFileSync(envPath, "utf8").split("\n") : [];

function upsert(key: string, value: string) {
  const idx = lines.findIndex((l) => l.startsWith(`${key}=`));
  const row = `${key}=${value}`;
  if (idx >= 0) lines[idx] = row;
  else lines.push(row);
}

upsert("ENABLE_OTA_SCRAPE", "true");
upsert("OTA_SCRAPE_MODE", "playwright");
upsert("OTA_SCRAPE_TIMEOUT_MS", "20000");

writeFileSync(envPath, lines.filter((l) => l.trim()).join("\n") + "\n", "utf8");
console.log("✅ 已写入 .env.local：ENABLE_OTA_SCRAPE=true");

try {
  console.log("📦 检查 Playwright…");
  execSync("npx playwright install chromium", { stdio: "inherit", cwd: process.cwd() });
} catch {
  console.warn("⚠ Playwright 安装跳过");
}

console.log("\n📍 若携程验证码拦截，请先运行: npm run scrape:login");
console.log("   在弹出浏览器中手动过验证码一次，之后 Cookie 自动复用。\n");

const cases = [
  ["杭州", "如家酒店", "330100", "hotel"],
  ["成都", "汉庭酒店", "510100", "hotel"],
  ["丽江", "丽江古城", "530700", "attraction"],
  ["张家界", "天门山", "430800", "attraction"],
] as const;

console.log("🧪 全国多城爬取测试…");
let ok = 0;
for (const args of cases) {
  try {
    execSync(`npm run scrape:test -- ${args.join(" ")}`, { stdio: "inherit" });
    ok++;
  } catch {
    console.warn(`⚠ ${args[0]} 测试未通过（可能需 scrape:login）`);
  }
}

if (ok > 0) {
  console.log(`\n✅ ${ok}/${cases.length} 城测试通过，npm run dev 即可全国规划`);
} else {
  console.log("\n⚠ 全部未通过 — 请运行 npm run scrape:login 过验证码后重试");
}
