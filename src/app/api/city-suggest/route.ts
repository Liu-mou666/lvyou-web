import { fetchCityInputTips } from "@/lib/apis/amap";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ tips: [] });
  }
  try {
    const tips = await fetchCityInputTips(q);
    return NextResponse.json({ tips });
  } catch (err) {
    const message = err instanceof Error ? err.message : "联想失败";
    return NextResponse.json({ tips: [], error: message }, { status: 500 });
  }
}
