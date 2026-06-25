import { inferBudgetLevelFromTotal } from "../engine/budget-planner";
import { z } from "zod";

export const tripRequestSchema = z.object({
  city: z.string().trim().min(1, "请输入目的地"),
  departureCity: z.string().trim().optional(),
  days: z.number().int().min(1).max(7),
  style: z.enum(["culture", "food", "nature", "shopping", "mixed"]),
  pace: z.enum(["relaxed", "normal", "intense"]),
  budget: z.enum(["budget", "moderate", "luxury"]),
  startDate: z.string().min(1),
  travelers: z.number().int().min(1).max(8),
  priority: z.enum(["value", "time", "experience"]).optional(),
  transportPref: z.enum(["transit", "taxi", "walk", "mixed"]).optional(),
  mealPref: z.enum(["local", "fast", "any"]).optional(),
  avoidCrowd: z.boolean().optional(),
  maxMealBudget: z.number().min(0).optional(),
  totalBudget: z.number().min(0).optional(),
  notes: z.string().optional(),
  departureStationMode: z.enum(["auto", "hsr", "classic"]).optional(),
  mustVisit: z.array(z.string().trim().min(1)).optional(),
  exclude: z.array(z.string().trim().min(1)).optional(),
  maxWalkKmPerDay: z.number().min(1).max(20).optional(),
  withChildren: z.boolean().optional(),
  withElderly: z.boolean().optional(),
  accessibility: z.boolean().optional(),
  dayStart: z.enum(["early", "normal", "late"]).optional(),
  seatPref: z.enum(["second", "first", "any"]).optional(),
  preferDirectTrain: z.boolean().optional(),
  maxTicketPerPerson: z.number().min(0).optional(),
});

export function normalizeTripRequest(data: z.infer<typeof tripRequestSchema>) {
  const travelers = data.travelers ?? 2;
  const budget =
    data.totalBudget && data.totalBudget > 0
      ? inferBudgetLevelFromTotal(data.totalBudget, data.days, travelers)
      : data.budget;
  return { ...data, budget, travelers };
}

export function buildTripRequest(data: z.infer<typeof tripRequestSchema>): import("../types").TripRequest {
  const n = normalizeTripRequest(data);
  return {
    ...n,
    departureCity: n.departureCity?.trim(),
    priority: n.priority ?? "value",
    transportPref: n.transportPref ?? "mixed",
    mealPref: n.mealPref ?? "local",
    avoidCrowd: n.avoidCrowd ?? false,
    maxMealBudget: n.maxMealBudget ?? 0,
    totalBudget: n.totalBudget ?? 0,
    notes: n.notes?.trim() || undefined,
    departureStationMode: n.departureStationMode ?? "auto",
    mustVisit: n.mustVisit?.filter(Boolean),
    exclude: n.exclude?.filter(Boolean),
    maxWalkKmPerDay: n.maxWalkKmPerDay ?? 8,
    withChildren: n.withChildren ?? false,
    withElderly: n.withElderly ?? false,
    accessibility: n.accessibility ?? false,
    dayStart: n.dayStart ?? "normal",
    seatPref: n.seatPref ?? "second",
    preferDirectTrain: n.preferDirectTrain ?? false,
    maxTicketPerPerson: n.maxTicketPerPerson ?? 0,
  };
}

export type TripRequestInput = z.infer<typeof tripRequestSchema>;
