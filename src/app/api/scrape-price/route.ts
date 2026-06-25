import { scrapeOtaPrice, isOtaScrapeEnabled } from "@/lib/scrapers/ota-scraper";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  type: z.enum(["hotel", "attraction"]),
  name: z.string().trim().min(1),
  cityName: z.string().trim().min(1),
  adcode: z.string().optional(),
  checkIn: z.string().optional(),
});

/** 自用 OTA 真爬测试接口（需 ENABLE_OTA_SCRAPE=true） */
export async function POST(req: Request) {
  if (!isOtaScrapeEnabled()) {
    return NextResponse.json(
      {
        error: "未开启 OTA 爬取。请在 .env.local 设置 ENABLE_OTA_SCRAPE=true",
        hint: "个人自用；Vercel 上可能被携程拦截，建议本地 npm run dev 或 OTA_SCRAPE_MODE=playwright",
      },
      { status: 403 },
    );
  }

  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "参数无效" }, { status: 400 });
    }

    const { type, name, cityName, adcode, checkIn } = parsed.data;
    const result = await scrapeOtaPrice(
      {
        id: `test-${name}`,
        name,
        type,
        category: "mixed",
        lat: 0,
        lng: 0,
        durationMinutes: 120,
        cost: 0,
        pricePerPerson: 0,
        rating: 4.5,
        reviewCount: 0,
        openTime: "09:00",
        closeTime: "18:00",
        indoor: false,
        description: "",
        tips: "",
      },
      { cityName, adcode, checkIn, travelers: 2 },
    );

    if (!result) {
      return NextResponse.json(
        {
          ok: false,
          message: "爬取未拿到价格（可能被反爬或页面结构变化）",
          tip: "尝试 OTA_SCRAPE_MODE=playwright 并 npm install playwright && npx playwright install chromium",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "爬取失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
