import { AXIS, NEUTRAL } from "@/lib/palette";

export const TOOLTIP_STYLE = {
  background: "var(--tooltip-bg)",
  border: "1px solid var(--tooltip-border)",
  borderRadius: "var(--tooltip-radius)",
  color: "var(--tooltip-color)",
  fontSize: "12px",
  padding: "8px 12px",
  boxShadow: "var(--tooltip-shadow)",
} as const;

export const AXIS_STYLE = {
  tick: { fill: "var(--axis-tick)" },
  tickMuted: { fill: "var(--axis-tick-muted)" },
  fontSize: 12,
  axisLine: false as const,
  tickLine: false as const,
} as const;

export const CURSOR_STYLE = { fill: "var(--cursor-fill)" };

/**
 * Width of a Y axis whose ticks read in 万 (「1200万」): four digits and 万 at
 * the 12px axis size plus Recharts' 8px tick offset, with room for the wider
 * glyphs Linux renders (a 40px axis cut 「900万」 in CI, not on macOS).
 */
export const Y_AXIS_MAN_WIDTH = 56;

/**
 * Series colours (design-spec-v1 §2, §10(b)).
 *
 * `upside`/`downside` are the only chromatic series. Everything else is a
 * neutral ink step — fully desaturated, so a chart can never imply a meaning
 * the data does not carry.
 */
export const CHART_COLORS = {
  upside: AXIS.up.text,
  upsideStrong: AXIS.up.strong,
  upsideFill: AXIS.up.fill,
  downside: AXIS.down.text,
  downsideStrong: AXIS.down.strong,
  downsideFill: AXIS.down.fill,
  neutral1: NEUTRAL[1],
  neutral2: NEUTRAL[2],
  neutral3: NEUTRAL[3],
  /** Signed change: gains are upside, losses are downside. */
  positive: AXIS.up.text,
  negative: AXIS.down.text,
} as const;
