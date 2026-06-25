import { buildPricePreview } from "@/lib/apis/preview-prices";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  departureCity: z.string().trim().min(1),
  city: z.string().trim().min(1),
  startDate: z.string().min(1),
  travelers: z.number().int().min(1).max(8).optional(),
  priority: z.enum(["value", "time", "experience"]).optional(),
  totalBudget: z.number().min(0).optional(),
  departureStationMode: z.enum(["auto", "hsr", "classic"]).optional(),
  mustVisit: z.array(z.string()).optional(),
  preferDirectTrain: z.boolean().optional(),
  seatPref: z.enum(["second", "first", "any"]).optional(),
  maxHotelPerNight: z.number().min(0).optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "参数无效" }, { status: 400 });
    }

    const data = parsed.data;
    const preview = await buildPricePreview({
      departureCity: data.departureCity,
      city: data.city,
      startDate: data.startDate,
      travelers: data.travelers ?? 2,
      priority: data.priority,
      totalBudget: data.totalBudget,
      departureStationMode: data.departureStationMode,
      mustVisit: data.mustVisit,
      preferDirectTrain: data.preferDirectTrain,
      seatPref: data.seatPref,
      maxHotelPerNight: data.maxHotelPerNight,
    });

    return NextResponse.json(preview);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "查价失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
