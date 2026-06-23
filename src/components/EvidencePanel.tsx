import type { Evidence } from "@/lib/types";

interface EvidencePanelProps {
  evidence: Evidence[];
  compact?: boolean;
}

export default function EvidencePanel({ evidence, compact }: EvidencePanelProps) {
  if (!evidence.length) return null;

  return (
    <details className={`group ${compact ? "text-xs" : "text-sm"}`}>
      <summary className="touch-target cursor-pointer list-none py-1 font-medium text-warm-muted active:text-warm-text [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-1">
          <span className="text-warm-500">▸</span> 查看依据（{evidence.length}）
        </span>
      </summary>
      <div className="mt-2 space-y-2 border-l-2 border-warm-300 pl-3">
        {evidence.map((ev, i) => (
          <div key={i} className="rounded-xl bg-warm-100 p-2.5">
            <p className="font-medium text-warm-text">{ev.claim}</p>
            <ul className="mt-1.5 space-y-1">
              {ev.sources.map((s, j) => (
                <li key={j} className="text-warm-muted">
                  <span className="font-medium text-warm-text">{s.name}：</span>
                  {s.value}
                  {s.url && (
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="ml-1 text-warm-600 active:underline">
                      验证
                    </a>
                  )}
                </li>
              ))}
            </ul>
            {ev.alternatives && ev.alternatives.length > 0 && (
              <p className="mt-1 text-warm-muted">备选枢纽：{ev.alternatives.join("、")}</p>
            )}
            <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] ${
              ev.confidence === "high" ? "bg-emerald-100 text-emerald-700" : ev.confidence === "medium" ? "bg-amber-100 text-amber-700" : "bg-warm-200 text-warm-muted"
            }`}>
              置信度：{ev.confidence === "high" ? "高" : ev.confidence === "medium" ? "中" : "低"}
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}
