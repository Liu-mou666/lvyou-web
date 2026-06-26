"use client";

import { inferBudgetLevelFromTotal } from "@/lib/engine/budget-planner";
import {
  budgetLevelLabel,
  PACE_ATTRACTIONS,
  STATION_MODES,
} from "@/lib/trip-form-options";
import type { BudgetLevel, TravelPace, TripRequest } from "@/lib/types";
import { buildTripRequest, tripRequestSchema } from "@/lib/validation/trip-schema";

export interface TripFormState {
  city: string;
  departureCity: string;
  startDate: string;
  days: number;
  travelers: number;
  style: import("@/lib/types").TravelStyle;
  pace: TravelPace;
  budget: BudgetLevel;
  priority: import("@/lib/types").PriorityMode;
  transportPref: import("@/lib/types").TransportPref;
  mealPref: import("@/lib/types").MealPref;
  avoidCrowd: boolean;
  maxMealBudget: number;
  totalBudget: number;
  notes: string;
  departureStationMode: "auto" | "hsr" | "classic";
  mustVisitText: string;
  excludeText: string;
  maxWalkKmPerDay: number;
  withChildren: boolean;
  withElderly: boolean;
  accessibility: boolean;
  dayStart: import("@/lib/types").DayStartPref;
  seatPref: import("@/lib/types").SeatPref;
  preferDirectTrain: boolean;
  maxTicketPerPerson: number;
  dietary: ("不辣" | "清真" | "素食")[];
  maxHotelPerNight: number;
  activePreset: string | null;
}

const STORAGE_KEY = "lvyou-trip-form-v2";

const DEFAULT_STATE: TripFormState = {
  city: "北京",
  departureCity: "上海",
  startDate: new Date().toISOString().split("T")[0],
  days: 3,
  travelers: 2,
  style: "mixed",
  pace: "normal",
  budget: "moderate",
  priority: "value",
  transportPref: "mixed",
  mealPref: "local",
  avoidCrowd: true,
  maxMealBudget: 0,
  totalBudget: 0,
  notes: "",
  departureStationMode: "auto",
  mustVisitText: "",
  excludeText: "",
  maxWalkKmPerDay: 8,
  withChildren: false,
  withElderly: false,
  accessibility: false,
  dayStart: "normal",
  seatPref: "second",
  preferDirectTrain: false,
  maxTicketPerPerson: 0,
  dietary: [],
  maxHotelPerNight: 0,
  activePreset: null,
};

export function loadTripFormState(): TripFormState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<TripFormState>;
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return DEFAULT_STATE;
  }
}

export function saveTripFormState(state: TripFormState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function computeFormSummary(state: TripFormState) {
  const visits = PACE_ATTRACTIONS[state.pace] * state.days;
  const inferred =
    state.totalBudget > 0
      ? inferBudgetLevelFromTotal(state.totalBudget, state.days, state.travelers)
      : state.budget;
  const perPersonDay =
    state.totalBudget > 0 ? Math.round(state.totalBudget / state.days / state.travelers) : null;

  const end = new Date(state.startDate);
  end.setDate(end.getDate() + state.days - 1);
  const endDate = end.toISOString().split("T")[0];

  const warnings: string[] = [];
  if (state.totalBudget > 0 && state.totalBudget < state.travelers * state.days * 120) {
    warnings.push("总预算偏紧，可能仅够市内花费，往返火车需另算");
  }
  if (state.pace === "intense" && state.days >= 4) {
    warnings.push("紧凑节奏 × 多天较累，注意预留休息");
  }

  const stationLabel = STATION_MODES.find((m) => m.value === state.departureStationMode)?.label ?? "自动";

  return {
    visits,
    inferred,
    perPersonDay,
    endDate,
    warnings,
    stationLabel,
    budgetLocked: state.totalBudget > 0,
  };
}

export function formStateToPayload(state: TripFormState) {
  return {
    city: state.city.trim(),
    departureCity: state.departureCity.trim(),
    days: state.days,
    style: state.style,
    pace: state.pace,
    budget: state.budget,
    startDate: state.startDate,
    travelers: state.travelers,
    priority: state.priority,
    transportPref: state.transportPref,
    mealPref: state.mealPref,
    avoidCrowd: state.avoidCrowd,
    maxMealBudget: state.maxMealBudget,
    totalBudget: state.totalBudget,
    notes: state.notes.trim() || undefined,
    departureStationMode: state.departureStationMode,
    mustVisit: state.mustVisitText
      .split(/[,，、/|]/)
      .map((s) => s.trim())
      .filter(Boolean),
    exclude: state.excludeText
      .split(/[,，、/|]/)
      .map((s) => s.trim())
      .filter(Boolean),
    maxWalkKmPerDay: state.maxWalkKmPerDay,
    withChildren: state.withChildren,
    withElderly: state.withElderly,
    accessibility: state.accessibility,
    dayStart: state.dayStart,
    seatPref: state.seatPref,
    preferDirectTrain: state.preferDirectTrain,
    maxTicketPerPerson: state.maxTicketPerPerson,
    dietary: state.dietary.length > 0 ? state.dietary : undefined,
    maxHotelPerNight: state.maxHotelPerNight,
  };
}

export function formStateToTripRequest(state: TripFormState): {
  trip: TripRequest | null;
  errors: Record<string, string>;
} {
  const parsed = tripRequestSchema.safeParse(formStateToPayload(state));
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!errors[key]) errors[key] = issue.message;
    }
    return { trip: null, errors };
  }
  return { trip: buildTripRequest(parsed.data), errors: {} };
}
