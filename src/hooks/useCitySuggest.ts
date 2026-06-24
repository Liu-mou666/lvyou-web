"use client";

import { useEffect, useRef, useState } from "react";

export function useCitySuggest(keywords: string) {
  const [tips, setTips] = useState<Array<{ name: string; district: string }>>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const q = keywords.trim();
    if (q.length < 2) {
      setTips([]);
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/city-suggest?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setTips(data.tips ?? []);
      } catch {
        setTips([]);
      } finally {
        setLoading(false);
      }
    }, 280);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [keywords]);

  return { tips, loading };
}
