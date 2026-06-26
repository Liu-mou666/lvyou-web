import { generateItineraryWithProgress } from "@/lib/itinerary-generator";
import { buildTripRequest, tripRequestSchema } from "@/lib/validation/trip-schema";
import type { GenerateStreamEvent } from "@/lib/types/stream";

export const runtime = "nodejs";
export const maxDuration = 120;

const GENERATE_TIMEOUT_MS = 115_000;

function sseLine(event: GenerateStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}超时（${Math.round(ms / 1000)}s）`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export async function POST(request: Request) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: GenerateStreamEvent) => {
        controller.enqueue(encoder.encode(sseLine(event)));
      };

      try {
        const body = await request.json();
        const parsed = tripRequestSchema.safeParse(body);
        if (!parsed.success) {
          send({ type: "error", message: parsed.error.issues[0]?.message ?? "参数无效" });
          controller.close();
          return;
        }

        const trip = buildTripRequest(parsed.data);

        await withTimeout(
          generateItineraryWithProgress(trip, send),
          GENERATE_TIMEOUT_MS,
          "行程生成",
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "生成失败";
        controller.enqueue(encoder.encode(sseLine({ type: "error", message })));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
