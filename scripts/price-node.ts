/**
 * 本地 Price Node — 可选服务，供前端 WebSocket 拉取携程实价
 * 用法: npm run price-node  （需 ENABLE_OTA_SCRAPE=true + scrape:login）
 */
import http from "node:http";
import { scrapeOtaPrice, isOtaScrapeEnabled } from "../src/lib/scrapers/ota-scraper";
import type { POI } from "../src/lib/types";

const PORT = Number(process.env.PRICE_NODE_PORT ?? 3921);

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    return json(res, 200, {
      ok: true,
      otaEnabled: isOtaScrapeEnabled(),
      port: PORT,
    });
  }

  if (req.method === "POST" && req.url === "/scrape") {
    if (!isOtaScrapeEnabled()) {
      return json(res, 503, { error: "ENABLE_OTA_SCRAPE 未开启" });
    }

    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    let body: { poi: POI; cityName: string; travelers?: number; checkIn?: string };
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return json(res, 400, { error: "无效 JSON" });
    }

    try {
      const result = await scrapeOtaPrice(body.poi, {
        cityName: body.cityName,
        travelers: body.travelers ?? 2,
        checkIn: body.checkIn,
      });
      return json(res, 200, { result, fetchedAt: new Date().toISOString() });
    } catch (err) {
      const message = err instanceof Error ? err.message : "爬取失败";
      return json(res, 500, { error: message });
    }
  }

  json(res, 404, { error: "not found" });
});

server.listen(PORT, () => {
  console.log(`[price-node] http://127.0.0.1:${PORT}  (POST /scrape, GET /health)`);
  if (!isOtaScrapeEnabled()) {
    console.warn("[price-node] 警告: ENABLE_OTA_SCRAPE 未设为 true，爬取接口将返回 503");
  }
});
