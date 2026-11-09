import { describe, it, expect } from "vitest";
import { sampleTransportTrends } from "@/data/sample";

/**
 * The one set that remains is checked here. sampleDemographics and
 * sampleTransportStations, and their three integrity tests, left with
 * real-data plan PR 1: the two live endpoints no longer fall back to them,
 * so there is no bundled copy to keep complete. sampleLandPrices left with
 * PR 5 (the 地価 surfaces read the 地価公示 snapshot); sampleZoning with PR 6
 * (the 用途地域 surfaces read the A55-24 snapshot), and its sum-to-100 check
 * with it. sampleDisasterRisks and sampleLandPriceSummary left with PR 7 (the
 * 災害 surfaces and the LP hero read the 災害 and 地価公示 snapshots), and their
 * level and change-rate checks with them. sampleWardProfiles left with PR 8:
 * the radar became the 「23区の中での位置」 table, which reads the endpoints.
 * Only the 乗降客数推移 set (sampleTransportTrends) is still sample.
 */
describe("Sample data integrity", () => {
  it("the ridership trend has one row per station and year, with a positive count", () => {
    const keys = new Set(sampleTransportTrends.map((t) => `${t.station}:${t.year}`));
    expect(keys.size).toBe(sampleTransportTrends.length);
    for (const t of sampleTransportTrends) expect(t.passengers).toBeGreaterThan(0);
  });
});
