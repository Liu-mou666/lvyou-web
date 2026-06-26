"use client";

import type { POI } from "@/lib/types";
import PriceBadge from "@/components/v2/PriceBadge";
import { poiToPriceTruth } from "@/lib/price-truth";
import {
  formatPriceLine,
  pickCompareUrls,
  pickPrimaryPriceAction,
} from "@/lib/engine/price-intelligence";
import { useState } from "react";

const PLATFORM_STYLE: Record<string, string> = {
  ctrip: "bg-sky-50 text-sky-800 border-sky-200",
  dianping: "bg-orange-50 text-orange-800 border-orange-200",
  meituan: "bg-yellow-50 text-yellow-900 border-yellow-200",
  fliggy: "bg-purple-50 text-purple-800 border-purple-200",
  amap: "bg-blue-50 text-blue-800 border-blue-200",
};

const CONF_BADGE: Record<string, string> = {
  high: "bg-emerald-500 text-white",
  medium: "bg-sky-500 text-white",
  low: "bg-amber-500 text-white",
  none: "bg-warm-400 text-white",
};

const CONF_TEXT: Record<string, string> = {
  high: "高德收录",
  medium: "公开参考",
  low: "区间估算",
  none: "待查价",
};

interface PriceCheckBarProps {
  poi: POI;
  travelers?: number;
  /** 隐藏次要平台按钮（避免与上方重复） */
  compact?: boolean;
}

export default function PriceCheckBar({ poi, travelers = 2, compact = false }: PriceCheckBarProps) {
  const links = poi.links ?? [];
  const primary = pickPrimaryPriceAction(poi, links);
  const compareUrls = pickCompareUrls(poi, links);
  const priceLine = formatPriceLine(poi, travelers);
  const conf = poi.priceConfidence ?? (poi.pricePerPerson > 0 ? "high" : "none");
  const [copied, setCopied] = useState(false);

  function openCompare() {
    compareUrls.forEach((url, i) => {
      setTimeout(() => window.open(url, "_blank", "noopener,noreferrer"), i * 400);
    });
  }

  async function copyPrimaryLink() {
    if (!primary?.url) return;
    try {
      await navigator.clipboard.writeText(primary.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.open(primary.url, "_blank");
    }
  }

  const secondary = links
    .filter((l) => !l.url.startsWith("tel:") && l.url !== primary?.url)
    .slice(0, 4);

  const truth = poiToPriceTruth(poi, travelers);

  return (
    <div className="mt-3 rounded-xl border border-warm-200 bg-gradient-to-br from-warm-50 to-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold text-warm-text">智能查价</p>
        <PriceBadge truth={truth} compact />
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${CONF_BADGE[conf] ?? CONF_BADGE.none}`}>
          {CONF_TEXT[conf] ?? "待查"}
        </span>
        <span className="ml-auto text-xs tabular-nums text-warm-700">{priceLine}</span>
      </div>

      {primary && (
        <div className="mt-2 flex gap-2">
          <a
            href={primary.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-warm-500 px-4 py-3 text-sm font-semibold text-white shadow-sm active:scale-[0.98]"
          >
            <span>{primary.label}</span>
            <span className="text-xs font-normal opacity-90">→ {primary.sublabel}</span>
          </a>
          <button
            type="button"
            onClick={copyPrimaryLink}
            className="shrink-0 rounded-xl border border-warm-300 bg-white px-3 text-xs font-medium text-warm-700"
          >
            {copied ? "已复制" : "复制链接"}
          </button>
        </div>
      )}

      {compareUrls.length >= 2 && !compact && (
        <button
          type="button"
          onClick={openCompare}
          className="mt-2 w-full rounded-xl border border-warm-300 bg-white py-2.5 text-xs font-medium text-warm-700"
        >
          一键打开 {compareUrls.length} 个平台比价
        </button>
      )}

      {secondary.length > 0 && !compact && (
        <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {secondary.map((link, i) => (
            <a
              key={`${link.platform}-${i}`}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex min-h-[40px] items-center justify-center rounded-lg border px-2 py-2 text-[11px] font-medium ${PLATFORM_STYLE[link.platform] ?? "border-warm-200 bg-white"}`}
            >
              {link.label} · {link.action}
            </a>
          ))}
        </div>
      )}

      <p className="mt-2 text-[10px] text-warm-muted">
        无需商业 API：高德收录 + 名景公开价库 + 深链直达平台实价页
      </p>
    </div>
  );
}
