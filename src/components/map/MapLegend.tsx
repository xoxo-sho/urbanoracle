"use client";

import type { DataLayer } from "@/types";
import { CHOROPLETH_NOTE, SAMPLE_NOTICE, SOURCES } from "@/lib/sources";

interface MapLegendProps {
  layers: DataLayer[];
  /**
   * Whether the station bubbles are sized from ODPT ridership. Defaults to
   * false so an unwired caller labels the bubbles as sample rather than
   * silently presenting them as measured.
   */
  transportIsLive?: boolean;
}

// The ward fill under these layers is coloured from WARD_META in
// ward-boundaries.ts — a hardcoded table, neither the live feed nor the
// sample set. The legend says so under the ramp.
const CHOROPLETH_LAYERS = new Set<string>(["land-price", "demographics", "disaster-risk"]);

// Legend swatches mirror the map ramps, which are single-hue intensity
// scales per semantic axis (design-spec-v1 §2).
const LEGEND_CONFIG: Record<string, { label: string; stops: { color: string; label: string }[] }> = {
  "land-price": {
    label: "地価（万円/m²）",
    stops: [
      { color: "var(--up-fill)", label: "30" },
      { color: "var(--up-strong)", label: "200" },
      { color: "var(--up-text)", label: "530" },
    ],
  },
  demographics: {
    label: "人口密度（人/km²）",
    stops: [
      { color: "var(--chart-5)", label: "5k" },
      { color: "var(--chart-4)", label: "15k" },
      { color: "var(--chart-3)", label: "23k" },
    ],
  },
  "disaster-risk": {
    // The tiles are GSI rasters fetched client-side; this label is true.
    label: "ハザードマップ（実データ）",
    stops: [
      { color: "var(--down-fill)", label: "浅い" },
      { color: "var(--down-strong)", label: "浸水" },
      { color: "var(--down-text)", label: "深い" },
    ],
  },
  transportation: {
    label: "乗降客数",
    stops: [
      { color: "var(--up-fill)", label: "少" },
      { color: "var(--up-text)", label: "多" },
    ],
  },
};

export default function MapLegend({ layers, transportIsLive = false }: MapLegendProps) {
  const activeLayers = layers.filter((l) => l.enabled && LEGEND_CONFIG[l.id]);
  if (activeLayers.length === 0) return null;

  return (
    <div className="absolute bottom-3 left-3 z-10 map-overlay rounded-sm px-3 py-2 space-y-2 max-w-[200px]">
      {activeLayers.map((layer) => {
        const config = LEGEND_CONFIG[layer.id];
        if (!config) return null;
        return (
          <div key={layer.id}>
            <div className="text-[9px] font-medium text-muted-foreground mb-1">{config.label}</div>
            <div className="flex items-center gap-0.5">
              {/* h-audit: data-ramp — the legend swatch is the colour scale itself. */}
              <div
                className="h-2 flex-1 rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${config.stops.map((s) => s.color).join(", ")})`,
                }}
              />
            </div>
            <div className="flex justify-between mt-0.5">
              {config.stops.map((s, i) => (
                <span key={i} className="text-[8px] text-muted-foreground">{s.label}</span>
              ))}
            </div>
            {CHOROPLETH_LAYERS.has(layer.id) && (
              <p className="sample-legend mt-1 text-[8px] leading-snug" data-provenance="fixed">
                塗り分け: {CHOROPLETH_NOTE}
              </p>
            )}
            {layer.id === "transportation" &&
              (transportIsLive ? (
                <p className="mt-1 text-[8px] leading-snug text-muted-foreground/80">
                  出典: {SOURCES.odpt.label}
                </p>
              ) : (
                <p className="sample-legend mt-1 text-[8px] leading-snug" data-provenance="sample">
                  {SAMPLE_NOTICE}
                </p>
              ))}
          </div>
        );
      })}
    </div>
  );
}
