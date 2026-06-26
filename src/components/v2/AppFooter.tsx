"use client";

import { APP_BUILD_LABEL } from "@/lib/config/app-version";

export default function AppFooter() {
  return (
    <footer className="app-footer">
      <p>
        旅优 · 价格/车次以各平台实时为准 · <span className="tabular-nums">{APP_BUILD_LABEL}</span>
      </p>
      <p className="mt-1 text-[10px] opacity-80">
        全国引擎 · PriceTruth 真值标注 · 本地爬价请运行 npm run scrape:login
      </p>
    </footer>
  );
}
