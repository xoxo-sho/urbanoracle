import type { RidershipTrend, RidershipTrendView } from "@/types";

/**
 * 乗降客数推移 (real-data plan PR 4b, Architect decisions 2026-11-09): the
 * chart sums a fixed panel of 国土数値情報 S12 units for the selected ward —
 * or for 東京23区 — over the years the payload names. Everything here reads
 * the payload: the years, the values, the years left out and why, and how
 * much of the view the panel holds.
 */

/** The code of the 23区 view (the first one the route sends). */
export const TREND_TOTAL_CODE = "13100";

/** The view for the selection: the ward's, or 東京23区's when none is selected; null when the payload has none. */
export function trendView(trend: RidershipTrend | null | undefined, selectedWard: string | null): RidershipTrendView | null {
  const views = trend && Array.isArray(trend.views) ? trend.views : [];
  const view = selectedWard ? views.find((v) => v.name === selectedWard) : (views.find((v) => v.code === TREND_TOTAL_CODE) ?? views[0]);
  return view && Array.isArray(view.series) && view.series.length > 0 ? view : null;
}

/** 「79.4」: the panel's sum as a share of the view's 日間乗降客 in the last year; null when there is nothing to divide by. */
export function trendShare(view: RidershipTrendView): string | null {
  return view.passengers > 0 ? ((100 * view.panelPassengers) / view.passengers).toFixed(1) : null;
}

/** 「2018年度・2020〜2024年度」: the years as runs, so a year left out shows as a break. */
export function trendYearsLabel(years: number[]): string {
  const runs: [number, number][] = [];
  for (const year of [...years].sort((a, b) => a - b)) {
    const last = runs[runs.length - 1];
    if (last && year === last[1] + 1) last[1] = year;
    else runs.push([year, year]);
  }
  return runs.map(([from, to]) => (from === to ? `${from}年度` : `${from}〜${to}年度`)).join("・");
}

/**
 * One row per year from the first to the last, in order: a year the series
 * does not hold is a row without a value, so the line breaks there — it is
 * never joined across, never filled.
 */
export function trendChartRows(view: RidershipTrendView): { year: number; passengers: number | null }[] {
  const byYear = new Map(view.series.map((p) => [p.year, p.passengers]));
  const years = view.series.map((p) => p.year);
  const rows: { year: number; passengers: number | null }[] = [];
  for (let year = Math.min(...years); year <= Math.max(...years); year++) {
    rows.push({ year, passengers: byYear.get(year) ?? null });
  }
  return rows;
}

/**
 * What the sum covers, for the view: how many of its units the panel holds,
 * the panel's share of the last year's 日間乗降客, and whether the two totals
 * can be compared. When every unit is in the panel the last point is the
 * view's 日間乗降客 — and the text says so instead of claiming a difference.
 */
export function trendCoverageText(view: RidershipTrendView): string {
  const last = view.series[view.series.length - 1].year;
  const share = trendShare(view);
  const shareText = share === null ? "" : `${last}年度の値は日間乗降客の${share}%`;
  if (view.panelUnits < view.units) {
    return `全年度を同じ基準で比べられる${view.panelUnits}単位（全${view.units}単位中）の合計です。すべての駅の合計ではありません。${shareText}にあたり、日間乗降客とは一致しません。`;
  }
  return `この範囲は全${view.units}単位が対象です（${view.panelUnits}単位の合計）。${shareText}で、日間乗降客と一致します。`;
}
