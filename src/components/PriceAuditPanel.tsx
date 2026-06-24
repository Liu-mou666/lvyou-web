"use client";

import type { PriceAudit } from "@/lib/types";

const CONF_LABEL: Record<string, { label: string; cls: string }> = {
  high: { label: "高德收录", cls: "bg-emerald-100 text-emerald-800" },
  medium: { label: "公开参考", cls: "bg-sky-100 text-sky-800" },
  low: { label: "区间估算", cls: "bg-amber-100 text-amber-800" },
  none: { label: "待查价", cls: "bg-warm-100 text-warm-muted" },
};

interface PriceAuditPanelProps {
  audit: PriceAudit;
}

export default function PriceAuditPanel({ audit }: PriceAuditPanelProps) {
  return (
    <section className="card-warm p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-warm-text">价格可信度</h3>
          <p className="mt-1 text-xs text-warm-muted">{audit.summary}</p>
        </div>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-warm-glow text-lg font-bold text-warm-600">
          {audit.verifiedPercent}%
        </div>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs">
        <div className="rounded-lg bg-emerald-50 px-2 py-2">
          <p className="font-bold text-emerald-800">{audit.high}</p>
          <p className="text-emerald-700">高德</p>
        </div>
        <div className="rounded-lg bg-sky-50 px-2 py-2">
          <p className="font-bold text-sky-800">{audit.medium}</p>
          <p className="text-sky-700">公开参考</p>
        </div>
        <div className="rounded-lg bg-amber-50 px-2 py-2">
          <p className="font-bold text-amber-800">{audit.low}</p>
          <p className="text-amber-700">区间估</p>
        </div>
        <div className="rounded-lg bg-warm-100 px-2 py-2">
          <p className="font-bold text-warm-text">{audit.none}</p>
          <p className="text-warm-muted">待查</p>
        </div>
      </div>

      {audit.tips.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-warm-muted">
          {audit.tips.map((t) => (
            <li key={t}>· {t}</li>
          ))}
        </ul>
      )}

      {audit.needCheck.length > 0 && (
        <div className="mt-4 border-t border-warm-200 pt-3">
          <p className="text-xs font-semibold text-warm-text">建议出发前一键查价</p>
          <ul className="mt-2 space-y-2">
            {audit.needCheck.slice(0, 8).map((item) => {
              const conf = CONF_LABEL[item.confidence ?? "none"];
              return (
                <li
                  key={`${item.poiId}-${item.day}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warm-200 bg-white px-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${conf.cls}`}>
                      {conf.label}
                    </span>
                    <span className="ml-2 font-medium text-warm-text">{item.poiName}</span>
                    {item.day != null && <span className="text-warm-muted"> · 第{item.day}天</span>}
                  </div>
                  {item.checkUrl && (
                    <a
                      href={item.checkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 font-medium text-warm-600"
                    >
                      查价 →
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
