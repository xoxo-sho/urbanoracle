"use client";

import type { DataLayer, FieldSources } from "@/types";
import type { DataStatus } from "@/lib/use-gated-data";
import { SOURCES } from "@/lib/sources";
import { FAILED_TEXT, LOADING_TEXT } from "@/components/dashboard/DataState";
import { landPriceYearLabel, ridershipYearLabel } from "@/lib/census-sources";
import { LAND_USE_LABEL, manPrice, type LandUse } from "@/lib/land-price";
import { CHOROPLETH_LABEL, pct1, quakeShortLine } from "@/lib/disaster";
import { HAZARD_PORTAL_SOURCE } from "@/lib/credits";
import { HAZARD_RASTER_NAMES } from "@/components/map/hazard-rasters";
import { densityLegendSource } from "@/lib/census-map";

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
  /** State of the /disaster-risks answer that colours the 災害 choropleth (real-data plan PR 7). Required, as above. */
  disasterStatus: DataStatus;
  /** The /disaster-risks payload's `sources`: the survey and year the fill shows. */
  disasterSources?: FieldSources;
  /** The three stops of the 災害 ramp (share of 町丁目 at 総合危険度 rank 5), from the data; null while pending. */
  disasterStops?: number[] | null;
  /** State of the /demographics answer that colours the 人口 choropleth (real-data plan PR 8). */
  censusStatus?: DataStatus;
  /** The /demographics payload's `sources`: the census year the fill shows. */
  censusSources?: FieldSources;
  /** The three stops of the 人口 ramp (人/km²), from the census densities; null while pending. */
  densityStops?: number[] | null;
}

// Every ward fill is its payload's: 地価 since real-data plan PR 5, 災害 since
// PR 7 and 人口 since PR 8 (the 2025 census density). No fill reads a
// hardcoded table.

// The 人口 ramp's three colours, low to high; the stops themselves come from the data.
const DENSITY_COLORS = ["var(--chart-5)", "var(--chart-4)", "var(--chart-3)"];
// The 地価 ramp's three colours, low to high; the stops themselves come from the data.
const LAND_PRICE_COLORS = ["var(--up-fill)", "var(--up-strong)", "var(--up-text)"];
// The 災害 ramp's three colours (MapView's downFill / downStrong / downText), low to high.
const DISASTER_COLORS = ["var(--down-fill)", "var(--down-strong)", "var(--down-text)"];

// Legend swatches mirror the map ramps, which are single-hue intensity
// scales per semantic axis (design-spec-v1 §2).
const LEGEND_CONFIG: Record<string, { label: string; stops: { color: string; label: string }[] }> = {
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
      <p className="mt-1 text-xs leading-snug text-muted-foreground/80" data-state="loading">
        乗降客数: {LOADING_TEXT}
      </p>
    );
  }
  if (status !== "ok") {
    return (
      <p className="state-legend mt-1 text-xs leading-snug" data-state="unavailable">
        乗降客数: {FAILED_TEXT}
      </p>
    );
  }
  return (
    <p className="source-note mt-1">
      出典: {SOURCES.ksj.label}
      {year ? ` ${year}` : ""}
    </p>
  );
}

/**
 * Under the 災害 ramp (real-data plan PR 7): the survey and year the fill shows
 * when the answer arrived, else the state the fill is in; and, always, the 出典
 * of the hazard rasters drawn over it.
 */
function DisasterNote({ status, sources }: { status: DataStatus; sources?: FieldSources }) {
  const line = quakeShortLine(sources);
  return (
    <>
      {status === "loading" ? (
        <p className="mt-1 text-xs leading-snug text-muted-foreground/80" data-state="loading">
          {CHOROPLETH_LABEL}: {LOADING_TEXT}
        </p>
      ) : status !== "ok" ? (
        <p className="state-legend mt-1 text-xs leading-snug" data-state="unavailable">
          {CHOROPLETH_LABEL}: {FAILED_TEXT}
        </p>
      ) : (
        <p className="source-note mt-1">出典: {line ?? SOURCES.tokyoKikendo.label}（町丁目の相対評価）</p>
      )}
      <p className="source-note mt-1">
        重ね: {HAZARD_RASTER_NAMES} — {HAZARD_PORTAL_SOURCE}
      </p>
    </>
  );
}

/**
 * Under the 人口 ramp (real-data plan PR 8): the census year the fill shows when
 * the answer arrived, else the state the fill is in.
 */
function CensusNote({ status, sources }: { status: DataStatus; sources?: FieldSources }) {
  const line = densityLegendSource(sources);
  if (status === "loading") {
    return (
      <p className="mt-1 text-xs leading-snug text-muted-foreground/80" data-state="loading">
        人口密度: {LOADING_TEXT}
      </p>
    );
  }
  if (status === "unavailable") {
    return (
      <p className="state-legend mt-1 text-xs leading-snug" data-state="unavailable">
        人口密度: {FAILED_TEXT}
      </p>
    );
  }
  return line ? <p className="source-note mt-1">出典: {line}</p> : null;
}

/**
 * Under the 地価 ramp: the 国土数値情報 citation with the payload's year when the
 * answer arrived, else the state the fill is in (real-data plan PR 5).
 */
function LandPriceNote({ status, sources }: { status: DataStatus; sources?: FieldSources }) {
  const year = landPriceYearLabel(sources);
  if (status === "loading") {
    return (
      <p className="mt-1 text-xs leading-snug text-muted-foreground/80" data-state="loading">
        平均価格: {LOADING_TEXT}
      </p>
    );
  }
  if (status !== "ok") {
    return (
      <p className="state-legend mt-1 text-xs leading-snug" data-state="unavailable">
        平均価格: {FAILED_TEXT}
      </p>
    );
  }
  return (
    <p className="source-note mt-1">
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
  disasterStatus,
  disasterSources,
  disasterStops = null,
  censusStatus = "loading",
  censusSources,
  densityStops = null,
}: MapLegendProps) {
  const stops = landPriceStatus === "ok" && landPriceStops && landPriceStops.length === LAND_PRICE_COLORS.length ? landPriceStops : null;
  const landPriceConfig = {
    label: `平均価格（${LAND_USE_LABEL[landUse]}）万円/m²`,
    stops: LAND_PRICE_COLORS.map((color, i) => ({ color, label: stops ? manPrice(stops[i]) : "" })),
  };
  const quakeStops = disasterStatus === "ok" && disasterStops && disasterStops.length === DISASTER_COLORS.length ? disasterStops : null;
  const disasterConfig = {
    label: CHOROPLETH_LABEL,
    stops: DISASTER_COLORS.map((color, i) => ({ color, label: quakeStops ? pct1(quakeStops[i]) : "" })),
  };
  const popStops =
    (censusStatus === "ok" || censusStatus === "partial") && densityStops && densityStops.length === DENSITY_COLORS.length ? densityStops : null;
  const densityConfig = {
    label: "人口密度（人/km²）",
    stops: DENSITY_COLORS.map((color, i) => ({ color, label: popStops ? popStops[i].toLocaleString("ja-JP") : "" })),
  };
  const configFor = (id: string) =>
    id === "land-price" ? landPriceConfig : id === "disaster-risk" ? disasterConfig : id === "demographics" ? densityConfig : LEGEND_CONFIG[id];
  const stopsFor = (id: string) =>
    id === "land-price" ? stops : id === "disaster-risk" ? quakeStops : id === "demographics" ? popStops : undefined;
  const activeLayers = layers.filter((l) => l.enabled && configFor(l.id));
  if (activeLayers.length === 0) return null;

  return (
    <div className="absolute bottom-3 left-3 z-10 map-overlay rounded-sm px-3 py-2 space-y-2 max-w-[200px]">
      {activeLayers.map((layer) => {
        const config = configFor(layer.id);
        if (!config) return null;
        return (
          <div key={layer.id} data-legend={layer.id} data-legend-stops={stopsFor(layer.id) !== undefined ? JSON.stringify(stopsFor(layer.id)) : undefined}>
            <div className="text-xs font-medium text-muted-foreground mb-1">{config.label}</div>
            <div className="flex items-center gap-0.5">
              {/* h-audit: data-ramp — the legend swatch is the colour scale itself. */}
              <div
                className="h-2 flex-1 rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${config.stops.map((s) => s.color).join(", ")})`,
                }}
              />
            </div>
            {(stopsFor(layer.id) === undefined || stopsFor(layer.id)) && (
              <div className="flex justify-between mt-0.5">
                {config.stops.map((s, i) => (
                  <span key={i} className="text-xs text-muted-foreground" data-stop={stopsFor(layer.id) !== undefined ? "" : undefined}>
                    {s.label}
                  </span>
                ))}
              </div>
            )}
            {layer.id === "demographics" && <CensusNote status={censusStatus} sources={censusSources} />}
            {layer.id === "land-price" && <LandPriceNote status={landPriceStatus} sources={landPriceSources} />}
            {layer.id === "disaster-risk" && <DisasterNote status={disasterStatus} sources={disasterSources} />}
            {layer.id === "transportation" && (
              <TransportNote status={transportStatus} sources={transportSources} />
            )}
          </div>
        );
      })}
    </div>
  );
}
