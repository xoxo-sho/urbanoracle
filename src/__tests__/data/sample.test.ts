import { describe, it, expect } from "vitest";
import * as sample from "@/data/sample";

/**
 * No sample set remains. sampleDemographics and sampleTransportStations left
 * with real-data plan PR 1; sampleLandPrices with PR 5; sampleZoning with PR 6;
 * sampleDisasterRisks and sampleLandPriceSummary with PR 7; sampleWardProfiles
 * with PR 8; and the last one, the 乗降客数推移 set, with PR 4b —
 * the chart sums a fixed panel of 国土数値情報 S12 rows. What is left in the
 * module is the layer list, which is not data; moving it and deleting the
 * file is PR 9.
 */
describe("src/data/sample.ts", () => {
  it("holds the layer list and no sample set", () => {
    expect(Object.keys(sample)).toEqual(["dataLayers"]);
    expect(sample.dataLayers.map((l) => l.id)).toEqual(["land-price", "demographics", "disaster-risk", "transportation", "zoning"]);
  });
});
