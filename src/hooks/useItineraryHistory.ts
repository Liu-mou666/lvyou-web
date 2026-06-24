"use client";

import type { Itinerary, TripRequest } from "@/lib/types";
import { useCallback, useEffect, useState } from "react";

export interface SavedTrip {
  id: string;
  city: string;
  days: number;
  totalCost: number;
  savedAt: string;
  request: TripRequest;
  itinerary: Itinerary;
}

const STORAGE_KEY = "lvyou-itinerary-history";
const MAX_ITEMS = 12;

function readAll(): SavedTrip[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedTrip[];
  } catch {
    return [];
  }
}

function writeAll(items: SavedTrip[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch {
    /* quota */
  }
}

export function useItineraryHistory() {
  const [history, setHistory] = useState<SavedTrip[]>([]);

  useEffect(() => {
    setHistory(readAll());
  }, []);

  const save = useCallback((request: TripRequest, itinerary: Itinerary) => {
    const entry: SavedTrip = {
      id: `${Date.now()}-${itinerary.city}`,
      city: itinerary.city,
      days: itinerary.days.length,
      totalCost: itinerary.totalCost,
      savedAt: new Date().toISOString(),
      request,
      itinerary,
    };
    const next = [entry, ...readAll().filter((h) => h.id !== entry.id)].slice(0, MAX_ITEMS);
    writeAll(next);
    setHistory(next);
    return entry.id;
  }, []);

  const remove = useCallback((id: string) => {
    const next = readAll().filter((h) => h.id !== id);
    writeAll(next);
    setHistory(next);
  }, []);

  const exportJson = useCallback((itinerary: Itinerary, request?: TripRequest) => {
    const blob = new Blob(
      [JSON.stringify({ request, itinerary, exportedAt: new Date().toISOString() }, null, 2)],
      { type: "application/json" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `旅优-${itinerary.city}-${itinerary.days.length}天.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, []);

  return { history, save, remove, exportJson };
}
