"use client";

import {
  formatPriceTruth,
  priceTruthBadgeClass,
  priceTruthSourceLabel,
  type PriceTruth,
} from "@/lib/price-truth";

interface PriceBadgeProps {
  truth: PriceTruth;
  compact?: boolean;
}

export default function PriceBadge({ truth, compact }: PriceBadgeProps) {
  const cls = priceTruthBadgeClass(truth.confidence);
  const source = priceTruthSourceLabel(truth.source);

  if (compact) {
    return (
      <span className={`source-badge ${cls}`} title={truth.label}>
        {source}
      </span>
    );
  }

  return (
    <span className={`source-badge ${cls}`} title={truth.label}>
      {source}
      {truth.confidence === "high" && " ✓"}
    </span>
  );
}

interface PriceHeroProps {
  truth: PriceTruth;
  subtitle?: string;
  className?: string;
}

export function PriceHero({ truth, subtitle, className = "" }: PriceHeroProps) {
  const display = truth.amount > 0 ? formatPriceTruth(truth) : "待查价";

  return (
    <div className={`price-hero ${className}`}>
      <p className="price-hero-amount tabular-nums">{display}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <PriceBadge truth={truth} />
        {subtitle && <span className="text-xs text-warm-muted">{subtitle}</span>}
      </div>
      {truth.label && truth.amount > 0 && (
        <p className="mt-1 text-[11px] leading-relaxed text-warm-muted">{truth.label}</p>
      )}
      {truth.verifyUrl && (
        <a
          href={truth.verifyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-xs font-medium text-warm-600 underline"
        >
          平台核实 →
        </a>
      )}
    </div>
  );
}
