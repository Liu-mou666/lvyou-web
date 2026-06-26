"use client";

import type { Itinerary, TripRequest } from "@/lib/types";
import type { GenerateStreamEvent } from "@/lib/types/stream";
import { useCallback, useRef, useState } from "react";

export interface GenerateProgressState {
  step: string;
  percent: number;
  message: string;
}

function mergePartial(prev: Itinerary | null, patch: Partial<Itinerary>): Itinerary {
  const base: Itinerary =
    prev ??
    ({
      city: patch.city ?? "",
      days: patch.days ?? [],
      totalCost: patch.totalCost ?? 0,
      generatedAt: patch.generatedAt ?? new Date().toISOString(),
      optimizationScore: patch.optimizationScore ?? 0,
      realtimeNote: patch.realtimeNote ?? "",
      dataSources: patch.dataSources ?? [],
    } as Itinerary);

  return { ...base, ...patch, days: patch.days ?? base.days };
}

const GENERATE_CLIENT_TIMEOUT_MS = 118_000;

export function useGenerateStream() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<GenerateProgressState | null>(null);
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleEvent = useCallback((event: GenerateStreamEvent) => {
    switch (event.type) {
      case "progress":
        setProgress({ step: event.step, percent: event.percent, message: event.message });
        break;
      case "partial":
        setItinerary((prev) => mergePartial(prev, event.patch));
        break;
      case "day":
        setItinerary((prev) => {
          const base = mergePartial(prev, {});
          const days = [...base.days];
          days[event.day - 1] = event.dayPlan;
          return { ...base, days };
        });
        break;
      case "complete":
        setItinerary(event.itinerary);
        setProgress({ step: "done", percent: 100, message: "行程已生成" });
        break;
      case "error":
        setError(event.message);
        break;
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  }, []);

  const generate = useCallback(
    async (request: TripRequest) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);
      setProgress({ step: "start", percent: 5, message: "准备生成…" });
      setItinerary(null);

      try {
        const timeoutId = setTimeout(() => controller.abort(), GENERATE_CLIENT_TIMEOUT_MS);

        const res = await fetch("/api/generate/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error ?? "请求失败");
        }

        if (!res.body) throw new Error("无法读取响应流");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n");
          buffer = parts.pop() ?? "";

          for (const line of parts) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const json = trimmed.slice(5).trim();
            if (!json) continue;
            try {
              handleEvent(JSON.parse(json) as GenerateStreamEvent);
            } catch {
              /* 忽略单行解析失败 */
            }
          }
        }

        const tail = buffer.trim();
        if (tail.startsWith("data:")) {
          const json = tail.slice(5).trim();
          if (json) {
            try {
              handleEvent(JSON.parse(json) as GenerateStreamEvent);
            } catch {
              /* ignore */
            }
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setError("生成超时，请缩短天数或稍后重试");
          return;
        }
        setError(err instanceof Error ? err.message : "生成失败");
      } finally {
        setLoading(false);
        abortRef.current = null;
      }
    },
    [handleEvent],
  );

  return { generate, cancel, loading, progress, itinerary, error, setItinerary, setError };
}
