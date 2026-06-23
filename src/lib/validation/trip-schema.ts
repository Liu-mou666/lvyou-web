import { z } from "zod";

export const tripRequestSchema = z.object({
  city: z.string().trim().min(1, "请输入目的地"),
  departureCity: z.string().trim().optional(),
  days: z.number().int().min(1).max(7),
  style: z.enum(["culture", "food", "nature", "shopping", "mixed"]),
  pace: z.enum(["relaxed", "normal", "intense"]),
  budget: z.enum(["budget", "moderate", "luxury"]),
  startDate: z.string().min(1),
  travelers: z.number().int().min(1).max(8).optional(),
  priority: z.enum(["value", "time", "experience"]).optional(),
  transportPref: z.enum(["transit", "taxi", "walk", "mixed"]).optional(),
  mealPref: z.enum(["local", "fast", "any"]).optional(),
  avoidCrowd: z.boolean().optional(),
  maxMealBudget: z.number().min(0).optional(),
  totalBudget: z.number().min(0).optional(),
  notes: z.string().optional(),
});

export type TripRequestInput = z.infer<typeof tripRequestSchema>;
