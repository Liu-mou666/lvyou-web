"use client";

import MapView from "@/components/MapView";
import type { Itinerary } from "@/lib/types";
import { useEffect } from "react";

interface MapDrawerProps {
  open: boolean;
  onClose: () => void;
  itinerary: Itinerary | null;
}

export default function MapDrawer({ open, onClose, itinerary }: MapDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !itinerary) return null;

  return (
    <div className="map-drawer-overlay" role="dialog" aria-modal="true" aria-label="行程地图">
      <button type="button" className="map-drawer-backdrop" onClick={onClose} aria-label="关闭地图" />
      <div className="map-drawer-panel">
        <div className="map-drawer-header">
          <h2 className="text-sm font-semibold text-warm-text">行程地图</h2>
          <button type="button" onClick={onClose} className="map-drawer-close">
            关闭
          </button>
        </div>
        <div className="map-drawer-body">
          <MapView itinerary={itinerary} />
        </div>
      </div>
    </div>
  );
}
