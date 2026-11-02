"use client";

import type { DataLayer, FieldSources } from "@/types";
import type { DataStatus } from "@/lib/use-gated-data";
import { CHOROPLETH_NOTE, SOURCES } from "@/lib/sources";
import { FAILED_TEXT, LOADING_TEXT } from "@/components/dashboard/DataState";
import { landPriceYearLabel, ridershipYearLabel } from "@/lib/census-sources";
import { LAND_USE_LABEL, manPrice, type LandUse } from "@/lib/land-price";

interface MapLegendProps {
  layers: DataLayer[];
  /**
   * State of the /transport answer that sizes the station bubbles. Required:
   * an unwired caller is a type error, not a silent claim about the data.
   */
  transportStatus: DataStatus;
  /** The /transport payload's `sources`: the 国土数値情報 edition and year the bubbles show. */
  transportSources?: FieldSources;
  /** State of the /land-prices answer that colours the 地価 choropleth (real-data plan PR 5). Required, as above. */
  landPriceStatus: DataStatus;
  /** The /land-prices payload's `sources`: the 地価公示 edition and year the fill shows. */
  landPriceSources?: FieldSources;
  /** The use the 地価 surfaces show; 住宅地 by default. */
  landUse?: LandUse;
  /** The three stops the map ramp uses for that use, from the data; null while pending. */
  landPriceStops?: number[] | null;
}

// The ward fill under these layers is coloured from WARD_META in
// ward-boundaries.ts — a hardcoded table, neither the live feed nor the
// sample set. The legend says so under the ramp. The 地価 layer left that
// table in real-data plan PR 5: its fill is the 地価公示 snapshot's.
const CHOROPLETH_LAYERS = new Set<string>(["demographics", "disaster-risk"]);

// The 地価 ramp's three colours, low to high; the stops themselves come from the data.
const LAND_PRICE_COLORS = ["var(--up-fill)", "var(--up-strong)", "var(--up-text)"];

// Legend swatches mirror the map ramps, which are single-hue intensity
// scales per semantic axis (design-spec-v1 §2).
const LEGEND_CONFIG: Record<string, { label: string; stops: { color: string; label: string }[] }> = {
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

/**
 * Under the 乗降客数 ramp: the 国土数値情報 citation with the payload's year when
 * the answer arrived, else the state the bubbles are in (real-data plan PR 4).
 */
function TransportNote({ status, sources }: { status: DataStatus; sources?: FieldSources }) {
  const year = ridershipYearLabel(sources);
  if (status === "loading") {
    return (
      <p className="mt-1 text-[8px] leading-snug text-muted-foreground/80" data-state="loading">
        乗降客数: {LOADING_TEXT}
      </p>
    );
  }
  if (status !== "ok") {
    return (
      <p className="state-legend mt-1 text-[8px] leading-snug" data-state="unavailable">
        乗降客数: {FAILED_TEXT}
      </p>
    );
  }
  return (
    <p className="mt-1 text-[8px] leading-snug text-muted-foreground/80">
      出典: {SOURCES.ksj.label}
      {year ? ` ${year}` : ""}
    </p>
  );
}

/**
 * Under the 地価 ramp: the 国土数値情報 citation with the payload's year when the
 * answer arrived, else the state the fill is in (real-data plan PR 5).
 */
function LandPriceNote({ status, sources }: { status: DataStatus; sources?: FieldSources }) {
  const year = landPriceYearLabel(sources);
  if (status === "loading") {
    return (
      <p className="mt-1 text-[8px] leading-snug text-muted-foreground/80" data-state="loading">
        平均価格: {LOADING_TEXT}
      </p>
    );
  }
  if (status !== "ok") {
    return (
      <p className="state-legend mt-1 text-[8px] leading-snug" data-state="unavailable">
        平均価格: {FAILED_TEXT}
      </p>
    );
  }
  return (
    <p className="mt-1 text-[8px] leading-snug text-muted-foreground/80">
      出典: {SOURCES.ksj.label}
      {year ? ` ${year}` : ""}
    </p>
  );
}

export default function MapLegend({
  layers,
  transportStatus,
  transportSources,
  landPriceStatus,
  landPriceSources,
  landUse = "residential",
  landPriceStops = null,
}: MapLegendProps) {
  const stops = landPriceStatus === "ok" && landPriceStops && landPriceStops.length === LAND_PRICE_COLORS.length ? landPriceStops : null;
  const landPriceConfig = {
    label: `平均価格（${LAND_USE_LABEL[landUse]}）万円/m²`,
    stops: LAND_PRICE_COLORS.map((color, i) => ({ color, label: stops ? manPrice(stops[i]) : "" })),
  };
  const configFor = (id: string) => (id === "land-price" ? landPriceConfig : LEGEND_CONFIG[id]);
  const activeLayers = layers.filter((l) => l.enabled && configFor(l.id));
  if (activeLayers.length === 0) return null;

  return (
    <div className="absolute bottom-3 left-3 z-10 map-overlay rounded-sm px-3 py-2 space-y-2 max-w-[200px]">
      {activeLayers.map((layer) => {
        const config = configFor(layer.id);
        if (!config) return null;
        return (
          <div key={layer.id} data-legend={layer.id} data-legend-stops={layer.id === "land-price" ? JSON.stringify(stops) : undefined}>
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
            {(layer.id !== "land-price" || stops) && (
              <div className="flex justify-between mt-0.5">
                {config.stops.map((s, i) => (
                  <span key={i} className="text-[8px] text-muted-foreground" data-stop={layer.id === "land-price" ? "" : undefined}>
                    {s.label}
                  </span>
                ))}
              </div>
            )}
            {CHOROPLETH_LAYERS.has(layer.id) && (
              <p className="sample-legend mt-1 text-[8px] leading-snug" data-provenance="fixed">
                塗り分け: {CHOROPLETH_NOTE}
              </p>
            )}
            {layer.id === "land-price" && <LandPriceNote status={landPriceStatus} sources={landPriceSources} />}
            {layer.id === "transportation" && (
              <TransportNote status={transportStatus} sources={transportSources} />
            )}
          </div>
        );
      })}
    </div>
  );
}
