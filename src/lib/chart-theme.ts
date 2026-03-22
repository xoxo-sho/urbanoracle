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
  fontSize: 10,
  axisLine: false as const,
  tickLine: false as const,
} as const;

export const CURSOR_STYLE = { fill: "var(--cursor-fill)" };

export const CHART_COLORS = {
  primary: "var(--chart-1)",
  secondary: "var(--chart-2)",
  warning: "var(--chart-3)",
  purple: "var(--chart-4)",
  yellow: "var(--chart-5)",
  primaryMuted: "var(--chart-1)",
  positive: "oklch(0.55 0.18 160)",
  negative: "oklch(0.55 0.2 25)",
} as const;
