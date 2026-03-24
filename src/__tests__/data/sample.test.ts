import { describe, it, expect } from "vitest";
import {
  sampleDemographics,
  sampleLandPrices,
  sampleLandPriceSummary,
  sampleDisasterRisks,
  sampleTransportStations,
  sampleWardProfiles,
  sampleZoning,
} from "@/data/sample";

describe("Sample data integrity", () => {
  it("has demographics for all 23 Tokyo wards", () => {
    expect(sampleDemographics).toHaveLength(23);
    for (const d of sampleDemographics) {
      expect(d.region).toMatch(/区$/);
      expect(d.population).toBeGreaterThan(0);
      expect(d.ageGroups.young + d.ageGroups.working + d.ageGroups.elderly).toBe(100);
    }
  });

  it("has unique ward names in demographics", () => {
    const names = sampleDemographics.map((d) => d.region);
    expect(new Set(names).size).toBe(names.length);
  });

  it("has valid land price points", () => {
    expect(sampleLandPrices.length).toBeGreaterThan(0);
    for (const p of sampleLandPrices) {
      expect(p.lat).toBeGreaterThan(35);
      expect(p.lat).toBeLessThan(36);
      expect(p.lng).toBeGreaterThan(139);
      expect(p.lng).toBeLessThan(140);
      expect(p.price).toBeGreaterThan(0);
    }
  });

  it("has land price summaries with valid change rates", () => {
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

  it("has transport stations with ward assignments", () => {
    for (const s of sampleTransportStations) {
      expect(s.ward).toBeDefined();
      expect(s.ward).toMatch(/区$/);
      expect(s.lines.length).toBeGreaterThan(0);
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
