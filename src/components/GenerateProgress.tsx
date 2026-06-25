"use client";

import type { GenerateProgressState } from "@/hooks/useGenerateStream";
import { motion } from "motion/react";

interface GenerateProgressProps {
  progress: GenerateProgressState;
  compact?: boolean;
}

const STEPS = [
  { key: "start", label: "解析" },
  { key: "city", label: "定位" },
  { key: "transport", label: "交通" },
  { key: "attractions", label: "景点" },
  { key: "ranked", label: "榜单" },
  { key: "day", label: "排程" },
  { key: "done", label: "完成" },
];

function stepIndex(step: string): number {
  if (step === "done") return STEPS.length - 1;
  if (step.startsWith("day-")) return 5;
  const idx = STEPS.findIndex((s) => s.key === step);
  return idx >= 0 ? idx : 0;
}

export default function GenerateProgress({ progress, compact, onCancel }: GenerateProgressProps & { onCancel?: () => void }) {
  const current = stepIndex(progress.step);
  const pct = Math.min(100, Math.max(0, progress.percent));

  if (compact) {
    return (
      <div className="rounded-xl border border-warm-200 bg-warm-50/80 px-3 py-2">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-medium text-warm-text">{progress.message}</span>
          <div className="flex items-center gap-2">
            <span className="tabular-nums text-warm-muted">{pct}%</span>
            {onCancel && (
              <button type="button" onClick={onCancel} className="rounded-md border border-warm-300 px-2 py-0.5 text-warm-700">
                取消
              </button>
            )}
          </div>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-warm-200">
          <motion.div
            className="h-full rounded-full bg-warm-500"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          />
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-warm p-4 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-warm-text">正在生成行程</h3>
          <p className="mt-1 text-sm text-warm-muted">{progress.message}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-lg bg-warm-glow px-2.5 py-1 text-sm font-bold tabular-nums text-warm-600">
            {pct}%
          </span>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-warm-300 px-3 py-1 text-xs font-medium text-warm-700"
            >
              取消
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-warm-200">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-warm-400 to-warm-500"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {STEPS.map((s, i) => {
          const active = i <= current;
          return (
            <span
              key={s.key}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                active ? "bg-warm-500 text-white" : "bg-warm-100 text-warm-muted"
              }`}
            >
              {s.label}
            </span>
          );
        })}
      </div>

      <p className="mt-3 text-[11px] text-warm-muted">交通与榜单会先出现，每日行程将逐天加载</p>
    </motion.div>
  );
}
