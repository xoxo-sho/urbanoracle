import type { DisasterWard, FieldSource, FieldSources, QuakeKind } from "@/types";

/**
 * The 災害 figures on screen (real-data plan PR 7, Architect decisions 1, 8
 * and the sub-decisions of 2026-11-05). Each hazard keeps its source's own
 * classes; nothing here invents a scale or a threshold.
 */

export const QUAKE_KINDS: { key: QuakeKind; name: string }[] = [
  { key: "total", name: "総合危険度" },
  { key: "building", name: "建物倒壊危険度" },
  { key: "fire", name: "火災危険度" },
];

/** K2's label (decision 8): the count of 町丁目 at 総合危険度 rank 5 — the survey's own class. */
export const K2_LABEL = "総合危険度ランク5の町丁目";
export const CHOROPLETH_LABEL = "総合危険度ランク5の町丁目の割合";
export const DEEP_LABEL = "浸水深3m以上";

/** 「5（全199町丁目中）」 — the count with its denominator. */
export function countOf(count: number, n: number): string {
  return `${count}（全${n.toLocaleString("ja-JP")}町丁目中）`;
}

/** The earthquake source of the payload, or null when it names none. */
export function quakeSource(sources: FieldSources | null | undefined): FieldSource | null {
  const s = sources?.earthquake;
  return s && Number.isFinite(s.year) ? s : null;
}

/** K2's source line, from the payload: 「東京都 地域危険度 第9回（2022年）」. */
export function quakeShortLine(sources: FieldSources | null | undefined): string | null {
  const s = quakeSource(sources);
  return s ? `東京都 ${s.table}（${s.year}年）` : null;
}

/**
 * 「出典: …（A31a-25）」 — the label and table of one hazard's source, from the
 * payload. The table is printed once: a label that already names it is not
 * followed by it again (the 津波 line read 「…（A40-23）（A40-23）」 until PR 8).
 */
export function hazardLine(sources: FieldSources | null | undefined, key: string): string | null {
  const s = sources?.[key];
  if (!s || !Number.isFinite(s.year)) return null;
  return s.label.includes(s.table) ? s.label : `${s.label}（${s.table}）`;
}

/** The record in view: the selected ward's, or the 23区's (`total`). */
export function disasterView(rows: readonly DisasterWard[], total: DisasterWard | null, selectedWard: string | null): DisasterWard | null {
  return selectedWard ? (rows.find((r) => r.region === selectedWard) ?? null) : total;
}

/**
 * The choropleth's three stops from the data: the min, median and max of the
 * wards' share of 町丁目 at 総合危険度 rank 5 (the legend prints the same array).
 * Null when the data cannot make a ramp.
 */
export function rank5Stops(rows: readonly DisasterWard[]): [number, number, number] | null {
  const values = rows
    .map((r) => r.earthquake.rank5Share)
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);
  if (values.length < 2) return null;
  const min = values[0];
  const max = values[values.length - 1];
  if (max <= min) return null;
  const median = values[Math.floor(values.length / 2)];
  const middle = median > min && median < max ? median : (min + max) / 2;
  return [min, middle, max];
}

/** 12.3456 → "12.3%". */
export function pct1(v: number): string {
  return `${v.toFixed(1)}%`;
}
