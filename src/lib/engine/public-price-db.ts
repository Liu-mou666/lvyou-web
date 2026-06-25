import hints from "@/data/public-ticket-hints.json";
import type { POI } from "../types";

interface TicketHint {
  name: string;
  city: string;
  keywords: string[];
  ticket: number;
  note: string;
  peakTicket?: number;
  offPeakTicket?: number;
  peakMonths?: number[];
}

const DB = hints as TicketHint[];

function normalize(s: string): string {
  return s.replace(/\s/g, "").replace(/风景区|风景名胜区|景区|公园|博物馆/g, "");
}

/** 按出行日期解析淡旺季门票（苏州园林等） */
export function resolveTicketPrice(hint: TicketHint, visitDate?: string): number {
  if (!hint.peakTicket || !hint.offPeakTicket || !hint.peakMonths?.length || !visitDate) {
    return hint.ticket;
  }
  const month = new Date(visitDate).getMonth() + 1;
  return hint.peakMonths.includes(month) ? hint.peakTicket : hint.offPeakTicket;
}

/** 匹配景区公开窗口参考价（非 OTA 实时价） */
export function lookupPublicTicketHint(
  poiName: string,
  cityName?: string,
  visitDate?: string,
): (TicketHint & { resolvedTicket: number }) | null {
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

  if (bestScore < 8 || !best) return null;
  const resolvedTicket = resolveTicketPrice(best, visitDate);
  return { ...best, resolvedTicket };
}

export function applyPublicTicketHint(poi: POI, cityName?: string, visitDate?: string): POI {
  if (poi.type !== "attraction" || poi.pricePerPerson > 0) return poi;
  const hint = lookupPublicTicketHint(poi.name, cityName, visitDate);
  if (!hint) return poi;

  const travelers = 2;
  const price = hint.resolvedTicket;
  const seasonNote =
    hint.peakTicket && hint.offPeakTicket
      ? `本次按${price === hint.peakTicket ? "旺季" : "淡季"}计 ¥${price}`
      : hint.note;

  return {
    ...poi,
    pricePerPerson: price,
    cost: price > 0 ? price * travelers : 0,
    freeAttraction: price === 0,
    priceConfidence: "medium",
    priceNote: `政府指导价参考 ¥${price}/人（${seasonNote}）· 非携程实时价，请点查价按钮核实`,
    evidence: [
      ...(poi.evidence ?? []),
      {
        claim: "门票参考价",
        confidence: "medium",
        sources: [
          {
            name: "公开窗口价库",
            value: `¥${price}/人 · ${seasonNote}`,
            fetchedAt: new Date().toISOString(),
          },
        ],
      },
    ],
  };
}
