import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
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
// The backend sample copy and its generator left in real-data plan PR 7, and
// src/data/sample.ts itself in PR 9 (no-sample-layer.test.tsx requires its
// absence): a guard that they carry no X holds a fortiori when they are gone.
const readIfAny = (rel: string) => (existsSync(resolve(REPO_ROOT, rel)) ? read(rel) : "");

describe("no client-side fallback to sample.ts on the two live surfaces", () => {
  it("page.tsx no longer passes sampleDemographics / sampleTransportStations to the hook (F9)", () => {
    const page = read("src/app/app/page.tsx");
    expect(page).not.toContain("sampleDemographics");
    expect(page).not.toContain("sampleTransportStations");
  });

  it("sample.ts no longer exports the two live sets", () => {
    const sample = readIfAny("src/data/sample.ts");
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
    expect(readIfAny("src/data/sample.ts")).not.toMatch(/export const samplePopulationTrends\b/);
  });

  it("the LP dictionary and provenance table have no sample row for 人口推移", () => {
    expect(read("src/i18n/lp.ts")).not.toMatch(/\bsamplePopulation\b/);
    expect(read("src/components/landing/LandingContent.tsx")).not.toMatch(/\bsamplePopulation\b/);
  });

  it("the backend sample copy and its generator carry no population trend", () => {
    expect(readIfAny("backend/data/sample_fallback.json")).not.toContain("samplePopulationTrends");
    expect(readIfAny("scripts/gen-sample-fallback.mjs")).not.toContain("samplePopulationTrends");
  });
});

describe("PR 5: the 地価 surfaces read the 地価公示 snapshot; the sample fields stay only for the LP hero", () => {
  // RED on main (4b09098). sampleLandPrices and WARD_META.avgLandPrice /
  // priceChange leave; sampleLandPriceSummary stays, read by HeroSpread alone
  // until PR 7 switches the hero together with its downside.
  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry !== "__tests__" && entry !== "node_modules") walk(full, out);
      } else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
    }
    return out;
  }
  const importers = (symbol: string) =>
    walk(resolve(REPO_ROOT, "src"))
      .filter((file) => new RegExp(`\\b${symbol}\\b`).test(readFileSync(file, "utf8")))
      .map((file) => relative(REPO_ROOT, file))
      .filter((file) => file !== "src/data/sample.ts")
      .sort();

  it("sample.ts no longer exports sampleLandPrices, and no type for its points remains", () => {
    expect(readIfAny("src/data/sample.ts")).not.toMatch(/export const sampleLandPrices\b/);
    expect(read("src/types/index.ts")).not.toContain("LandPricePoint");
  });

  it("no dashboard surface reads sampleLandPriceSummary (PR 7 then removes the hero's read too)", () => {
    expect(importers("sampleLandPriceSummary").filter((f) => f !== "src/components/landing/HeroSpread.tsx")).toEqual([]);
    expect(read("src/app/app/page.tsx")).not.toContain("sampleLandPriceSummary");
  });

  it("WARD_META carries no 地価 field; the map and legend read none", () => {
    for (const file of ["src/data/ward-boundaries.ts", "src/components/map/MapView.tsx", "src/components/map/MapLegend.tsx"]) {
      expect(read(file), file).not.toContain("avgLandPrice");
      expect(read(file), file).not.toContain("priceChange");
    }
  });

  it("the backend sample copy and its generator carry no land price points", () => {
    expect(readIfAny("backend/data/sample_fallback.json")).not.toContain("sampleLandPrices");
    expect(readIfAny("scripts/gen-sample-fallback.mjs")).not.toContain("sampleLandPrices");
  });

  it("the LP dictionary and provenance table have no sample row for the dashboard's 地価 surfaces", () => {
    expect(read("src/i18n/lp.ts")).not.toMatch(/\bsampleLandPrice\b/);
    expect(read("src/components/landing/LandingContent.tsx")).not.toMatch(/\bsampleLandPrice\b/);
  });
});

describe("PR 6: the 用途地域 surfaces read the A55-24 snapshot; sampleZoning is gone", () => {
  // RED on main (506b880). The 用途地域 tab and the 災害 tab's mini-bar read
  // /api/v1/zoning; the sample set, its type, its import and the LP's sample
  // row for it all leave.
  it("sample.ts no longer exports sampleZoning, and the ZoningArea type is gone", () => {
    expect(readIfAny("src/data/sample.ts")).not.toMatch(/export const sampleZoning\b/);
    expect(read("src/types/index.ts")).not.toContain("ZoningArea");
  });

  it("page.tsx and DisasterRiskPanel read no sample zoning", () => {
    expect(read("src/app/app/page.tsx")).not.toContain("sampleZoning");
    expect(read("src/components/dashboard/DisasterRiskPanel.tsx")).not.toContain("ZoningArea");
  });

  it("the LP dictionary and provenance table have no sample row for 用途地域", () => {
    expect(read("src/i18n/lp.ts")).not.toMatch(/\bsampleZoning\b/);
    expect(read("src/components/landing/LandingContent.tsx")).not.toMatch(/\bsampleZoning\b/);
  });

  it("the backend sample copy and its generator carry no zoning", () => {
    expect(readIfAny("backend/data/sample_fallback.json")).not.toContain("sampleZoning");
    expect(readIfAny("scripts/gen-sample-fallback.mjs")).not.toContain("sampleZoning");
  });
});

describe("PR 7: 災害 and the LP hero read measured sources; the sample risk list and the hero's sample fields are gone", () => {
  // RED on main (deeb49d). The 災害 tab, K2, the 災害 choropleth and the LP
  // hero read the committed snapshots (東京都 地域危険度 第9回, 国土数値情報
  // A31a / A33 / A40 / A49, L01 for the hero's upside); the radar and its
  // sample 安全性 axis left in PR 8.
  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry !== "__tests__" && entry !== "node_modules") walk(full, out);
      } else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
    }
    return out;
  }
  const readers = (symbol: string) =>
    walk(resolve(REPO_ROOT, "src"))
      .filter((file) => new RegExp(`\\b${symbol}\\b`).test(readFileSync(file, "utf8")))
      .map((file) => relative(REPO_ROOT, file))
      .sort();

  it("sample.ts no longer exports sampleDisasterRisks or sampleLandPriceSummary, and nothing in src reads them", () => {
    const sample = readIfAny("src/data/sample.ts");
    expect(sample).not.toMatch(/export const sampleDisasterRisks\b/);
    expect(sample).not.toMatch(/export const sampleLandPriceSummary\b/);
    expect(readers("sampleDisasterRisks")).toEqual([]);
    expect(readers("sampleLandPriceSummary")).toEqual([]);
  });

  it("WARD_META carries no 災害 field and the map reads none", () => {
    for (const file of ["src/data/ward-boundaries.ts", "src/components/map/MapView.tsx", "src/components/map/MapLegend.tsx"]) {
      expect(read(file), file).not.toContain("maxRiskLevel");
      expect(read(file), file).not.toContain("riskTypes");
    }
  });

  it("the Lv.1–5 type and its colour ramp are gone", () => {
    expect(read("src/types/index.ts")).not.toMatch(/level:\s*1\s*\|\s*2/);
    expect(read("src/lib/palette.ts")).not.toContain("RISK_RAMP");
    expect(readers("riskStep")).toEqual([]);
  });

  it("the LP dictionary and provenance table have no sample row for the hero, 災害, the radar or the 人口 fill (PR 8)", () => {
    for (const file of ["src/i18n/lp.ts", "src/components/landing/LandingContent.tsx"]) {
      expect(read(file), file).not.toMatch(/\bsampleHero\b/);
      expect(read(file), file).not.toMatch(/\bsampleDisaster\b/);
      expect(read(file), file).not.toMatch(/\bsampleRadar(Scale)?\b/);
      expect(read(file), file).not.toMatch(/\bsampleChoropleth\b/);
    }
  });

  it("the radar and sampleWardProfiles are gone (PR 8, decision 7)", () => {
    expect(readIfAny("src/data/sample.ts")).not.toMatch(/\bsampleWardProfiles\b/);
    expect(existsSync(resolve(REPO_ROOT, "src/components/dashboard/WardRadar.tsx"))).toBe(false);
  });

  it("WARD_META carries no 人口 field and the fixed-value note is gone (PR 8)", () => {
    expect(read("src/data/ward-boundaries.ts")).not.toMatch(/\b(population|density|growthRate|elderly):\s*\d/);
    expect(readers("CHOROPLETH_NOTE")).toEqual([]);
  });

  it("the backend sample copy, its reader and its generator are gone", () => {
    expect(existsSync(resolve(REPO_ROOT, "backend/data/sample_fallback.json"))).toBe(false);
    expect(existsSync(resolve(REPO_ROOT, "backend/services/sample_data.py"))).toBe(false);
    expect(existsSync(resolve(REPO_ROOT, "scripts/gen-sample-fallback.mjs"))).toBe(false);
  });
});
