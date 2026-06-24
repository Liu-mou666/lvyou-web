import { generateItineraryWithProgress } from "@/lib/itinerary-generator";
import { buildTripRequest, tripRequestSchema } from "@/lib/validation/trip-schema";
import type { GenerateStreamEvent } from "@/lib/types/stream";

export const runtime = "nodejs";
export const maxDuration = 120;

function sseLine(event: GenerateStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
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

        await generateItineraryWithProgress(trip, send);
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
