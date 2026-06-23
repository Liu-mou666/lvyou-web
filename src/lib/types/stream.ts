import type { DayPlan, Itinerary } from "../types";

export type GenerateStreamEvent =
  | { type: "progress"; step: string; percent: number; message: string }
  | { type: "partial"; patch: Partial<Itinerary> }
  | { type: "day"; day: number; dayPlan: DayPlan }
  | { type: "complete"; itinerary: Itinerary }
  | { type: "error"; message: string };
