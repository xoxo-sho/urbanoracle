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
