export const TOOLTIP_STYLE = {
  background: "var(--tooltip-bg)",
  border: "1px solid var(--tooltip-border)",
  borderRadius: "var(--tooltip-radius)",
  color: "oklch(0.95 0 0)",
  fontSize: "12px",
  padding: "8px 12px",
  boxShadow: "var(--tooltip-shadow)",
} as const;

export const AXIS_STYLE = {
  tick: { fill: "var(--axis-tick)" },
  tickMuted: { fill: "var(--axis-tick-muted)" },
  fontSize: 10,
  axisLine: false as const,
  tickLine: false as const,
} as const;

export const CURSOR_STYLE = { fill: "oklch(1 0 0 / 3%)" };

// Semantic chart colors from CSS tokens
export const CHART_COLORS = {
  primary: "var(--chart-1)",
  secondary: "var(--chart-2)",
  warning: "var(--chart-3)",
  purple: "var(--chart-4)",
  yellow: "var(--chart-5)",
  primaryMuted: "oklch(0.55 0.12 250)",
  positive: "oklch(0.7 0.17 160)",
  negative: "oklch(0.7 0.18 25)",
} as const;
