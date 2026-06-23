import { generateItinerary } from "@/lib/itinerary-generator";
import { tripRequestSchema } from "@/lib/validation/trip-schema";
import type { TripRequest } from "@/lib/types";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = tripRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "参数无效" }, { status: 400 });
    }

    const trip: TripRequest = {
      ...parsed.data,
      departureCity: parsed.data.departureCity?.trim(),
      travelers: parsed.data.travelers ?? 2,
      priority: parsed.data.priority ?? "value",
      transportPref: parsed.data.transportPref ?? "mixed",
      mealPref: parsed.data.mealPref ?? "local",
      avoidCrowd: parsed.data.avoidCrowd ?? false,
      maxMealBudget: parsed.data.maxMealBudget ?? 0,
      totalBudget: parsed.data.totalBudget ?? 0,
      notes: parsed.data.notes?.trim() || undefined,
    };

    const itinerary = await generateItinerary(trip);

    return NextResponse.json(itinerary);
  } catch (error) {
    console.error("[api/generate]", error);
    const message = error instanceof Error ? error.message : "生成失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
