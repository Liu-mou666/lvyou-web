import { APP_BUILD_LABEL, APP_VERSION } from "@/lib/config/app-version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  const amapConfigured = Boolean(process.env.AMAP_KEY?.trim());
  const juheConfigured = Boolean(process.env.JUHE_TRAIN_KEY?.trim());
  const otaScrape = process.env.ENABLE_OTA_SCRAPE === "true";

  return Response.json({
    ok: amapConfigured,
    version: APP_VERSION,
    label: APP_BUILD_LABEL,
    uptimeMs: Date.now() - started,
    services: {
      amap: amapConfigured ? "ok" : "missing_key",
      juhe: juheConfigured ? "ok" : "optional",
      otaScrape: otaScrape ? "enabled" : "disabled",
    },
    timestamp: new Date().toISOString(),
  });
}
