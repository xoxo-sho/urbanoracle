import type { ZoningComposition, ZoningType } from "@/types";

/**
 * The 用途地域 figures on screen (real-data plan PR 6, Architect decisions
 * 2026-11-03): per composition — a ward's, or the 23区's — the share of the
 * designated area by type, the designated share of the ward and the
 * area-weighted 容積率 / 建蔽率 with their range. These helpers keep the
 * 用途地域 tab and the 災害 tab's mini-bar reading the same figure the same way.
 */

/** 31.7408 → "31.7%" (one decimal; the share is a percentage of the designated area). */
export function formatShare(pct: number): string {
  return `${pct.toFixed(1)}%`;
}

/** 40,904,123.4 m² → "40.90 km²". */
export function formatKm2(m2: number): string {
  return `${(m2 / 1e6).toFixed(2)} km²`;
}

/**
 * 「区の面積の84%が用途地域の指定区域」 — the designated share rounded to the
 * percent; the 23区 view says 23区の面積. The payload's figure is already the
 * area of (designated ∩ the N03 ward polygon) over the polygon's, so it never
 * exceeds 100.
 */
export function designatedLine(composition: ZoningComposition, selectedWard: string | null): string {
  const subject = selectedWard ? "区" : "23区";
  return `${subject}の面積の${Math.round(composition.designatedShare)}%が用途地域の指定区域`;
}

/** The types of a composition by share, largest first (the mini-bar's legend). */
export function topTypes(composition: ZoningComposition, n: number): ZoningType[] {
  return [...composition.types].sort((a, b) => b.share - a.share).slice(0, n);
}

/**
 * Segment and legend colour for the i-th type listed (A55 code order): a
 * neutral ink step, as every non-signed series on the dashboard — never a
 * hue that would imply a meaning the data does not carry. Eight inks exist;
 * the ninth type on starts again, lighter, so a legend dot still matches its
 * segment.
 */
export function typeStyle(index: number): { background: string; opacity?: number } {
  const ink = (index % 8) + 1;
  return index < 8 ? { background: `var(--ink-${ink})` } : { background: `var(--ink-${ink})`, opacity: 0.55 };
}

/** 「容積率 320.8%（範囲 300〜500%）」. */
export function rangeText(label: string, range: { mean: number; min: number; max: number }): string {
  return `${label} ${range.mean.toFixed(1)}%（範囲 ${range.min}〜${range.max}%）`;
}
