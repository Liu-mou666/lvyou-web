import { refreshDayItinerary } from "@/lib/itinerary-generator";
import { buildTripRequest, tripRequestSchema } from "@/lib/validation/trip-schema";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = tripRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "参数无效" }, { status: 400 });
    }

    const trip = buildTripRequest(parsed.data);
    const dayIndex = typeof body.dayIndex === "number" ? body.dayIndex : 0;
    const existingDay = body.existingDay as import("@/lib/types").DayPlan | undefined;
    const dayPlan = await refreshDayItinerary(trip, dayIndex, existingDay);

    if (!dayPlan) {
      return NextResponse.json({ error: "无法刷新该日行程" }, { status: 400 });
    }

    return NextResponse.json({
      dayPlan,
      refreshedAt: new Date().toISOString(),
      note: existingDay ? "已保留景点顺序，更新天气/交通/餐饮/住宿与价格" : "已重新拉取高德数据并更新排序",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "刷新失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
