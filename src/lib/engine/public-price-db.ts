import hints from "@/data/public-ticket-hints.json";
import type { POI } from "../types";

interface TicketHint {
  name: string;
  city: string;
  keywords: string[];
  ticket: number;
  note: string;
}

const DB = hints as TicketHint[];

function normalize(s: string): string {
  return s.replace(/\s/g, "").replace(/风景区|风景名胜区|景区|公园|博物馆/g, "");
}

/** 匹配景区公开窗口参考价（非 OTA 实时价） */
export function lookupPublicTicketHint(poiName: string, cityName?: string): TicketHint | null {
  const q = normalize(poiName);
  const city = cityName?.replace(/市$/g, "") ?? "";

  let best: TicketHint | null = null;
  let bestScore = 0;

  for (const h of DB) {
    let score = 0;
    const hn = normalize(h.name);
    if (hn === q || q.includes(hn) || hn.includes(q)) score += 10;
    for (const kw of h.keywords) {
      const k = normalize(kw);
      if (q.includes(k) || k.includes(q)) score += 8;
    }
    if (city && (h.city.includes(city) || city.includes(h.city.replace(/市$/g, "")))) score += 3;
    if (score > bestScore) {
      bestScore = score;
      best = h;
    }
  }

  return bestScore >= 8 ? best : null;
}

export function applyPublicTicketHint(poi: POI, cityName?: string): POI {
  if (poi.type !== "attraction" || poi.pricePerPerson > 0) return poi;
  const hint = lookupPublicTicketHint(poi.name, cityName);
  if (!hint) return poi;

  const travelers = 2; // 仅补 per-person，cost 在 enrich 层乘人数
  return {
    ...poi,
    pricePerPerson: hint.ticket,
    cost: hint.ticket > 0 ? hint.ticket * travelers : 0,
    freeAttraction: hint.ticket === 0,
    priceConfidence: "medium",
    priceNote: `公开窗口参考 ¥${hint.ticket}/人（${hint.note}）· 请以携程/窗口当日为准`,
    evidence: [
      ...(poi.evidence ?? []),
      {
        claim: "门票参考价",
        confidence: "medium",
        sources: [
          {
            name: "公开窗口价库",
            value: `¥${hint.ticket}/人 · ${hint.note}`,
            fetchedAt: new Date().toISOString(),
          },
        ],
      },
    ],
  };
}
