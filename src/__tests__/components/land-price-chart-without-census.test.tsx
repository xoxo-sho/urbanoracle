import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import LandPriceChart from "@/components/dashboard/LandPriceChart";
import { SOURCES } from "@/lib/sources";
import { FAILED_TEXT, LOADING_TEXT } from "@/components/dashboard/DataState";
import { LAND_PRICES_FIXTURE, LAND_PRICES_SOURCES } from "@/__tests__/fixtures/live-data";

/**
 * The 密度 vs 地価 scatter (L2) consumes two payloads: the census (x and z)
 * and the 地価公示 snapshot (y). While the census is loading or failed the page
 * hands it no rows. It must then say so — 読み込み中 or 取得失敗 naming e-Stat —
 * never draw a point from invented values and never an empty plot (real-data
 * plan PR 5, the Architect's addition of 2026-10-30); the bar beside it,
 * which needs the 地価 payload alone, keeps its figures.
 */
describe("LandPriceChart without census rows (demographics loading or failed)", () => {
  it("census failed: the bar keeps its 23-ward figures, the scatter says 取得失敗 and names e-Stat, no point, no sample label", () => {
    const { container } = render(
      <LandPriceChart
        wards={LAND_PRICES_FIXTURE}
        status="ok"
        sources={LAND_PRICES_SOURCES}
        landUse="residential"
        demographics={[]}
        demographicsStatus="unavailable"
        selectedWard={null}
      />
    );
    const text = container.textContent ?? "";
    expect(text).toContain("区別平均価格（住宅地）");
    expect(text).toContain("密度 vs 地価（住宅地）");
    expect(container.querySelectorAll("[data-ward-price]")).toHaveLength(LAND_PRICES_FIXTURE.length);
    const scatter = container.querySelector('[data-surface="land-price-scatter"]')!;
    expect(scatter.querySelector('[data-state="unavailable"]')).not.toBeNull();
    expect(scatter.textContent).toContain(FAILED_TEXT);
    expect(scatter.textContent).toContain(SOURCES.estat.label);
    expect(scatter.querySelectorAll("[data-point]")).toHaveLength(0);
    expect(container.querySelector('[data-provenance="sample"]')).toBeNull();
    // 世田谷区's deleted sample population, 939,099 → 「93.9万」, must not reappear anywhere.
    expect(text).not.toContain("93.9万");
  });

  it("census loading: the scatter says 読み込み中 and draws nothing", () => {
    const { container } = render(
      <LandPriceChart
        wards={LAND_PRICES_FIXTURE}
        status="ok"
        sources={LAND_PRICES_SOURCES}
        landUse="residential"
        demographics={[]}
        demographicsStatus="loading"
        selectedWard={null}
      />
    );
    const scatter = container.querySelector('[data-surface="land-price-scatter"]')!;
    expect(scatter.querySelector('[data-state="loading"]')).not.toBeNull();
    expect(scatter.textContent).toContain(LOADING_TEXT);
    expect(scatter.querySelectorAll("[data-point]")).toHaveLength(0);
  });
});
