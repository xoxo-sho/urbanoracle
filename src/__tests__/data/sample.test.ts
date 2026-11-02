import { describe, it, expect } from "vitest";
import {
  sampleLandPriceSummary,
  sampleDisasterRisks,
  sampleWardProfiles,
  sampleZoning,
} from "@/data/sample";

/**
 * The sets that remain are checked here. sampleDemographics and
 * sampleTransportStations, and their three integrity tests, left with
 * real-data plan PR 1: the two live endpoints no longer fall back to them,
 * so there is no bundled copy to keep complete. sampleLandPrices left with
 * PR 5 (the 地価 surfaces read the 地価公示 snapshot); sampleLandPriceSummary
 * stays only for the LP hero until PR 7 switches it with the downside.
 */
describe("Sample data integrity", () => {
  it("has land price summaries with valid change rates (the LP hero's set, until PR 7)", () => {
    for (const p of sampleLandPriceSummary) {
      expect(p.avgPrice).toBeGreaterThan(0);
      expect(p.maxPrice).toBeGreaterThanOrEqual(p.avgPrice);
      expect(p.minPrice).toBeLessThanOrEqual(p.avgPrice);
    }
  });

  it("has disaster risks with valid levels", () => {
    for (const r of sampleDisasterRisks) {
      expect(r.level).toBeGreaterThanOrEqual(1);
      expect(r.level).toBeLessThanOrEqual(5);
      expect(["flood", "earthquake", "landslide", "tsunami"]).toContain(r.type);
    }
  });

  it("has ward profiles for all 23 wards", () => {
    expect(sampleWardProfiles).toHaveLength(23);
    for (const p of sampleWardProfiles) {
      expect(p.population).toBeGreaterThanOrEqual(0);
      expect(p.population).toBeLessThanOrEqual(100);
    }
  });

  it("has zoning areas that sum to ~100%", () => {
    const total = sampleZoning.reduce((s, z) => s + z.areaPct, 0);
    expect(total).toBe(100);
  });
});
