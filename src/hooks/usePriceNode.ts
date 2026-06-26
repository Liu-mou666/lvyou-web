"use client";

import { mergePriceTruthFromEnrich } from "@/lib/price-truth";
import type { POI } from "@/lib/types";
import { useCallback } from "react";

const NODE_URL =
  typeof process !== "undefined" ? process.env.NEXT_PUBLIC_PRICE_NODE_URL?.replace(/\/$/, "") : undefined;

/**
 * 可选本地 Price Node 客户端（NEXT_PUBLIC_PRICE_NODE_URL=http://127.0.0.1:3921）
 */
export function usePriceNode() {
  const enabled = Boolean(NODE_URL);

  const scrapePrice = useCallback(
    async (poi: POI, cityName: string, travelers = 2, checkIn?: string): Promise<POI | null> => {
      if (!NODE_URL) return null;
      try {
        const res = await fetch(`${NODE_URL}/scrape`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ poi, cityName, travelers, checkIn }),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as {
          result?: { price: number; confidence?: POI["priceConfidence"]; source?: string; priceKind?: string };
        };
        const r = data.result;
        if (!r || r.price <= 0 || r.priceKind !== "scraped") return null;
        const unit = poi.type === "hotel" ? "/晚" : "/人";
        const updated: POI = {
          ...poi,
          pricePerPerson: r.price,
          cost: poi.type === "hotel" ? r.price : Math.round(r.price * travelers),
          priceConfidence: r.confidence ?? "high",
          priceNote: `Price Node 携程实价 ¥${r.price}${unit}`,
        };
        return mergePriceTruthFromEnrich(updated, travelers);
      } catch {
        return null;
      }
    },
    [],
  );

  return { enabled, scrapePrice };
}
