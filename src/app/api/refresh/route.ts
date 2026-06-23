import { refreshDayItinerary } from "@/lib/itinerary-generator";
import type { TripRequest } from "@/lib/types";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as TripRequest & { dayIndex?: number };

    if (!body.city?.trim()) {
      return NextResponse.json({ error: "无效城市" }, { status: 400 });
    }

    const dayIndex = body.dayIndex ?? 0;
    const dayPlan = await refreshDayItinerary(
      {
        city: body.city.trim(),
        days: body.days,
        style: body.style ?? "mixed",
        pace: body.pace ?? "normal",
        budget: body.budget ?? "moderate",
        startDate: body.startDate,
        travelers: 2,
        priority: body.priority,
        transportPref: body.transportPref,
        mealPref: body.mealPref,
        avoidCrowd: body.avoidCrowd,
        maxMealBudget: body.maxMealBudget,
        totalBudget: body.totalBudget,
        notes: body.notes,
      },
      dayIndex,
    );

    if (!dayPlan) {
      return NextResponse.json({ error: "无法刷新该日行程" }, { status: 400 });
    }

    return NextResponse.json({
      dayPlan,
      refreshedAt: new Date().toISOString(),
      note: "已重新拉取高德数据并更新排序",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "刷新失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
