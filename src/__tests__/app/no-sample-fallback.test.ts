import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * PR 1 of the real-data plan (RECON 2026-10-uo-real-data §9, "Deletes"; §7.1 F9):
 * no client-side fallback to sample.ts on the two live surfaces.
 *
 * `sampleDemographics` and `sampleTransportStations` leave src/data/sample.ts,
 * and src/app/app/page.tsx stops handing them to the hook as fallbacks.
 * Read from source rather than imported: importing a symbol this PR deletes
 * would make the guard itself fail to load once it is green.
 *
 * RED on main (8d17736).
 */

// vitest runs from the project root (vitest.config.ts); refuse to read from
// anywhere else rather than silently pass against the wrong tree.
const REPO_ROOT = process.cwd();
if (JSON.parse(readFileSync(resolve(REPO_ROOT, "package.json"), "utf-8")).name !== "urban-oracle") {
  throw new Error(`not the UrbanOracle root: ${REPO_ROOT}`);
}
const read = (rel: string) => readFileSync(resolve(REPO_ROOT, rel), "utf-8");

describe("no client-side fallback to sample.ts on the two live surfaces", () => {
  it("page.tsx no longer passes sampleDemographics / sampleTransportStations to the hook (F9)", () => {
    const page = read("src/app/app/page.tsx");
    expect(page).not.toContain("sampleDemographics");
    expect(page).not.toContain("sampleTransportStations");
  });

  it("sample.ts no longer exports the two live sets", () => {
    const sample = read("src/data/sample.ts");
    expect(sample).not.toMatch(/export const sampleDemographics\b/);
    expect(sample).not.toMatch(/export const sampleTransportStations\b/);
  });
});

describe("PR 3: 人口推移 is the committed census snapshot, not samplePopulationTrends", () => {
  // RED on main (149a782). The chart reads /api/v1/population-trends; the
  // sample set, its import, and the LP's sample row for it all leave.
  it("page.tsx no longer imports samplePopulationTrends", () => {
    expect(read("src/app/app/page.tsx")).not.toContain("samplePopulationTrends");
  });

  it("sample.ts no longer exports samplePopulationTrends", () => {
    expect(read("src/data/sample.ts")).not.toMatch(/export const samplePopulationTrends\b/);
  });

  it("the LP dictionary and provenance table have no sample row for 人口推移", () => {
    expect(read("src/i18n/lp.ts")).not.toMatch(/\bsamplePopulation\b/);
    expect(read("src/components/landing/LandingContent.tsx")).not.toMatch(/\bsamplePopulation\b/);
  });

  it("the backend sample copy and its generator carry no population trend", () => {
    expect(read("backend/data/sample_fallback.json")).not.toContain("samplePopulationTrends");
    expect(read("scripts/gen-sample-fallback.mjs")).not.toContain("samplePopulationTrends");
  });
});
