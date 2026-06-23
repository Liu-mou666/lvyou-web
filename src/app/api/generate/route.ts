import { generateItinerary } from "@/lib/itinerary-generator";
import type { TripRequest } from "@/lib/types";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as TripRequest;

    if (!body.city?.trim()) {
      return NextResponse.json({ error: "请输入目的地城市" }, { status: 400 });
    }

    if (!body.days || body.days < 1 || body.days > 7) {
      return NextResponse.json({ error: "行程天数需在 1-7 天之间" }, { status: 400 });
    }

    const itinerary = await generateItinerary({
      city: body.city.trim(),
      departureCity: body.departureCity?.trim(),
      days: body.days,
      style: body.style ?? "mixed",
      pace: body.pace ?? "normal",
      budget: body.budget ?? "moderate",
      startDate: body.startDate ?? new Date().toISOString().split("T")[0],
      travelers: 2,
      priority: body.priority ?? "value",
      transportPref: body.transportPref ?? "mixed",
      mealPref: body.mealPref ?? "local",
      avoidCrowd: body.avoidCrowd ?? false,
      maxMealBudget: body.maxMealBudget ?? 0,
      totalBudget: body.totalBudget ?? 0,
      notes: body.notes,
    });

    return NextResponse.json(itinerary);
  } catch (error) {
    console.error("[api/generate]", error);
    const message = error instanceof Error ? error.message : "生成失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
