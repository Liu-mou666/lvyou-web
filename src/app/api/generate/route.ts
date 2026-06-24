import { generateItinerary } from "@/lib/itinerary-generator";
import { buildTripRequest, tripRequestSchema } from "@/lib/validation/trip-schema";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = tripRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "参数无效" }, { status: 400 });
    }

    const itinerary = await generateItinerary(buildTripRequest(parsed.data));

    return NextResponse.json(itinerary);
  } catch (error) {
    console.error("[api/generate]", error);
    const message = error instanceof Error ? error.message : "生成失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
