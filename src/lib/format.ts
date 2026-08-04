/**
 * Formatting for statistics that may be unpublished.
 *
 * Upstream sources suppress cells (e-Stat writes "-", "***", "X"), which the
 * API forwards as null. null means "not published" and must never be shown
 * as 0 — a fabricated zero reads as a real measurement.
 */

export const NO_DATA = "データなし";

export function hasValue(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** 66,680 → "6.7万" */
export function formatMan(value: number | null | undefined, digits = 1): string {
  return hasValue(value) ? `${(value / 10000).toFixed(digits)}万` : NO_DATA;
}

/** 21,300 → "21.3k" */
export function formatK(value: number | null | undefined, digits = 1): string {
  return hasValue(value) ? `${(value / 1000).toFixed(digits)}k` : NO_DATA;
}

/** 23 → "23%" */
export function formatPct(value: number | null | undefined): string {
  return hasValue(value) ? `${value}%` : NO_DATA;
}

/** Mean of the published values only; null when nothing is published. */
export function averageOf(
  items: readonly number[] | readonly (number | null)[]
): number | null {
  const values = (items as readonly (number | null)[]).filter(hasValue);
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Descending comparator that sorts unpublished values last. */
export function byValueDesc(
  a: number | null | undefined,
  b: number | null | undefined
): number {
  if (!hasValue(a) && !hasValue(b)) return 0;
  if (!hasValue(a)) return 1;
  if (!hasValue(b)) return -1;
  return b - a;
}
