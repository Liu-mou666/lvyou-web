import { getAmapKey } from "@/lib/config";
import { NextResponse } from "next/server";

/** 高德静态地图代理（内嵌地图底图） */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const markers = url.searchParams.get("markers") ?? "";
  const size = url.searchParams.get("size") ?? "750*400";
  const zoom = url.searchParams.get("zoom") ?? "12";

  if (!markers) {
    return NextResponse.json({ error: "缺少 markers" }, { status: 400 });
  }

  try {
    const key = getAmapKey();
    const staticUrl = new URL("https://restapi.amap.com/v3/staticmap");
    staticUrl.searchParams.set("key", key);
    staticUrl.searchParams.set("size", size);
    staticUrl.searchParams.set("zoom", zoom);
    staticUrl.searchParams.set("markers", markers);

    const res = await fetch(staticUrl.toString());
    if (!res.ok) {
      return NextResponse.json({ error: "静态地图获取失败" }, { status: 502 });
    }

    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "image/png",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "地图失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
