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
    for (const value of Object.values(CHART_COLORS)) {
      expect(value).toContain("var(--");
    }
  });

  it("series colors are the two semantic axes plus neutral steps", () => {
    // design-spec-v1 §2: colour carries meaning. Upside and downside are the
    // only chromatic series; everything else must be a neutral ink step.
    expect(CHART_COLORS.upside).toBe("var(--up-text)");
    expect(CHART_COLORS.downside).toBe("var(--down-text)");
    for (const key of ["neutral1", "neutral2", "neutral3"] as const) {
      expect(CHART_COLORS[key]).toMatch(/var\(--chart-[345]\)/);
    }
  });

  it("maps signed change onto the upside/downside axis", () => {
    expect(CHART_COLORS.positive).toBe(CHART_COLORS.upside);
    expect(CHART_COLORS.negative).toBe(CHART_COLORS.downside);
  });
});
