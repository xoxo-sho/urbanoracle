import type { LandPriceWard, LandUseFigures } from "@/types";
import { NO_DATA } from "@/lib/format";

/**
 * The 地価 figures on screen (real-data plan PR 5, Architect decision 4): per
 * ward and use, the mean 地価公示価格 over every point and the mean 対前年変動率
 * over the 継続 points, each with its count. One switch chooses the use for
 * every 地価 surface at once; these helpers keep the bar, the scatter, the
 * table and the choropleth reading the same figure the same way.
 */

export const LAND_USES = ["residential", "commercial"] as const;
export type LandUse = (typeof LAND_USES)[number];

export const LAND_USE_LABEL: Record<LandUse, string> = { residential: "住宅地", commercial: "商業地" };

export function figuresFor(ward: LandPriceWard, use: LandUse): LandUseFigures {
  return ward[use];
}

/** 3,631,429 → "363万" (the dashboard's 万円/m² rendering, no decimals). */
export function manPrice(yen: number): string {
  return `${(yen / 10000).toFixed(0)}万`;
}

/** 3,631,429 → 363.1: the scatter's y in 万円/m², one decimal. */
export function manY(yen: number): number {
  return Math.round(yen / 1000) / 10;
}

/** 10.6714 → "+10.7%"; null (no continuing point) → データなし, never 0. */
export function formatChange(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return NO_DATA;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

/**
 * The choropleth's three stops for a use, from the data: the lowest ward mean,
 * the median ward mean and the highest. The map ramp and the legend labels
 * are both built from this one array, so they cannot disagree. Null while
 * there is nothing to colour.
 */
export function landPriceStops(wards: readonly LandPriceWard[], use: LandUse): [number, number, number] | null {
  const values = wards
    .map((w) => w[use].meanPrice)
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  if (values.length < 2) return null;
  const min = values[0];
  const max = values[values.length - 1];
  if (max <= min) return null;
  const median = values[Math.floor(values.length / 2)];
  const middle = median > min && median < max ? median : (min + max) / 2;
  return [min, middle, max];
}

/** 格差 for a use over the wards given: the highest ward mean over the lowest, and the two wards. */
export function priceGap(wards: readonly LandPriceWard[], use: LandUse): { ratio: number; top: string; bottom: string } | null {
  if (wards.length < 2) return null;
  const sorted = [...wards].sort((a, b) => b[use].meanPrice - a[use].meanPrice);
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];
  if (bottom[use].meanPrice <= 0) return null;
  return { ratio: Math.round(top[use].meanPrice / bottom[use].meanPrice), top: top.region, bottom: bottom.region };
}

/** The 工業地 points over the wards given (a count only; no per-ward series). */
export function industrialCount(wards: readonly LandPriceWard[]): number {
  return wards.reduce((sum, w) => sum + w.industrial.n, 0);
}
