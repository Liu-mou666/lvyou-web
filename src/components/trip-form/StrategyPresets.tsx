"use client";

import type { TripFormState } from "@/hooks/useTripFormState";
import { STRATEGY_PRESETS } from "@/lib/trip-form-options";

interface StrategyPresetsProps {
  activeId: string | null;
  onApply: (patch: Partial<TripFormState>, presetId: string) => void;
}

export default function StrategyPresets({ activeId, onApply }: StrategyPresetsProps) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-warm-muted">一键策略（自动组合节奏、目标与约束）</p>
      <div className="strategy-preset-scroll">
        {STRATEGY_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onApply(preset.patch, preset.id)}
            className={`strategy-preset-card ${activeId === preset.id ? "active" : ""}`}
          >
            <span className="strategy-preset-emoji">{preset.emoji}</span>
            <span className="strategy-preset-label">{preset.label}</span>
            <span className="strategy-preset-desc">{preset.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
