import { reoptimizeDayItinerary } from "@/lib/itinerary-generator";
import { buildTripRequest, tripRequestSchema } from "@/lib/validation/trip-schema";
import type { DayPlan } from "@/lib/types";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = tripRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "参数无效" }, { status: 400 });
    }

    const dayIndex = typeof body.dayIndex === "number" ? body.dayIndex : 0;
    const attractionIds = Array.isArray(body.attractionIds) ? body.attractionIds.map(String) : [];
    const templateDay = body.templateDay as DayPlan | undefined;

    if (!templateDay || attractionIds.length === 0) {
      return NextResponse.json({ error: "缺少 templateDay 或 attractionIds" }, { status: 400 });
    }

    const trip = buildTripRequest(parsed.data);
    const dayPlan = await reoptimizeDayItinerary(trip, dayIndex, attractionIds, templateDay);

    if (!dayPlan) {
      return NextResponse.json({ error: "无法重算该日行程" }, { status: 400 });
    }

    return NextResponse.json({
      dayPlan,
      refreshedAt: new Date().toISOString(),
      note: "已按新顺序重算交通与距离",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "重算失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
