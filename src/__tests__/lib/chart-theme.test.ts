import { describe, it, expect } from "vitest";
import { TOOLTIP_STYLE, AXIS_STYLE, CHART_COLORS } from "@/lib/chart-theme";

describe("Chart theme", () => {
  it("tooltip style uses CSS variables", () => {
    expect(TOOLTIP_STYLE.background).toContain("var(--");
    expect(TOOLTIP_STYLE.color).toContain("var(--");
  });

  it("axis style has correct defaults", () => {
    expect(AXIS_STYLE.fontSize).toBe(10);
    expect(AXIS_STYLE.axisLine).toBe(false);
    expect(AXIS_STYLE.tickLine).toBe(false);
  });

  it("chart colors reference CSS variables", () => {
    expect(CHART_COLORS.primary).toContain("var(--");
    expect(CHART_COLORS.secondary).toContain("var(--");
    expect(CHART_COLORS.warning).toContain("var(--");
  });
});
