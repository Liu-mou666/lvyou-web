import { fetchCityInputTips } from "@/lib/apis/amap";
import { localCitySuggestTips } from "@/lib/city-suggest-local";
import { NextResponse } from "next/server";

export const maxDuration = 10;

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ tips: [] });
  }

  const tips = localCitySuggestTips(q);
  const seen = new Set(tips.map((t) => t.name.replace(/市$/g, "")));

  const addItems = (items: Array<{ name: string; district: string }>) => {
    for (const t of items) {
      const key = t.name.replace(/市$/g, "");
      if (seen.has(key)) continue;
      seen.add(key);
      tips.push(t);
      if (tips.length >= 8) break;
    }
  };

  try {
    const remote = await Promise.race([
      fetchCityInputTips(q),
      new Promise<Array<{ name: string; district: string }>>((resolve) => {
        setTimeout(() => resolve([]), 3500);
      }),
    ]);
    addItems(remote);
  } catch {
    /* 高德失败时仍返回本地联想 */
  }

  return NextResponse.json({ tips: tips.slice(0, 8) });
}
