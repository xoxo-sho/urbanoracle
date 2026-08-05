/**
 * The semantic palette (design-spec-v1 §2).
 *
 * Colour carries meaning and nothing else. There are exactly two chromatic
 * axes — upside 深紺 and downside 深銅 — and everything that is neither is a
 * neutral ink step. A hue chosen because it "looks nice" is a spec violation.
 *
 * DOM and Recharts read the CSS variables so light/dark switch automatically.
 * MapLibre cannot resolve CSS variables inside paint expressions, so the same
 * palette is mirrored as literal hexes in MAP_COLORS, keyed by mode.
 */

/** Token references for anything rendered in the DOM or by Recharts. */
export const AXIS = {
  up: {
    text: "var(--up-text)",
    strong: "var(--up-strong)",
    aa: "var(--up-aa)",
    ui: "var(--up-ui)",
    fill: "var(--up-fill)",
  },
  down: {
    text: "var(--down-text)",
    strong: "var(--down-strong)",
    aa: "var(--down-aa)",
    ui: "var(--down-ui)",
    fill: "var(--down-fill)",
  },
} as const;

/** Neutral ink steps for data that is neither upside nor downside. */
export const NEUTRAL = {
  1: "var(--chart-3)",
  2: "var(--chart-4)",
  3: "var(--chart-5)",
} as const;

/**
 * Literal hexes for MapLibre paint expressions, which cannot read CSS vars.
 * Must stay in step with globals.css; the palette test asserts the axis
 * endpoints match the token values.
 */
export const MAP_COLORS = {
  light: {
    upText: "#16305C",
    upStrong: "#0054A5",
    upAa: "#2272CD",
    upUi: "#4491EF",
    upFill: "#DCE6F4",
    downText: "#6E2417",
    downStrong: "#A02905",
    downAa: "#C34B2D",
    downUi: "#E66B4C",
    downFill: "#F4E1D8",
    neutral1: "#4A453D",
    neutral2: "#6E6960",
    neutral3: "#918B80",
    ground: "#FAF7F1",
    inkOnMap: "#1A1814",
    haloOnMap: "#FAF7F1",
    hairline: "rgba(26,24,20,0.20)",
    emptyFill: "rgba(26,24,20,0.03)",
  },
  dark: {
    upText: "#8AABD6",
    upStrong: "#54A1FF",
    upAa: "#2F7DDA",
    upUi: "#0660BA",
    upFill: "#1B2C42",
    downText: "#E9A387",
    downStrong: "#F77A5B",
    downAa: "#CF5739",
    downUi: "#AE3819",
    downFill: "#3A2117",
    neutral1: "#C6C4BE",
    neutral2: "#9E9C97",
    neutral3: "#74726D",
    ground: "#0F1319",
    inkOnMap: "#F2EFE8",
    haloOnMap: "#0F1319",
    hairline: "rgba(242,239,232,0.22)",
    emptyFill: "rgba(242,239,232,0.04)",
  },
} as const;

export type MapPalette = Record<keyof (typeof MAP_COLORS)["light"], string>;

export function mapPalette(dark: boolean): MapPalette {
  return dark ? MAP_COLORS.dark : MAP_COLORS.light;
}

/**
 * Disaster severity 1–5. Severity is downside, so it is a single-hue
 * intensity ramp rather than a traffic light: green→amber→red would introduce
 * two hues that carry no meaning in this system.
 */
export const RISK_RAMP = [
  { fill: "var(--chart-5)", text: "var(--muted-foreground)", bar: "var(--chart-5)" },
  { fill: "var(--chart-4)", text: "var(--muted-foreground)", bar: "var(--chart-4)" },
  { fill: "var(--down-fill)", text: "var(--down-text)", bar: "var(--down-ui)" },
  { fill: "var(--down-fill)", text: "var(--down-text)", bar: "var(--down-aa)" },
  { fill: "var(--down-fill)", text: "var(--down-text)", bar: "var(--down-strong)" },
] as const;

export function riskStep(level: number) {
  const index = Math.max(1, Math.min(5, Math.round(level))) - 1;
  return RISK_RAMP[index];
}
