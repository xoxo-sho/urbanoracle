import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SOURCES } from "@/lib/sources";

/**
 * Dashboard page truth (truth fix, Stage 1a/1b/1c).
 *
 * The page is rendered for real; only the things jsdom cannot host are
 * stubbed (the MapLibre canvas, the theme store, the auth banner) and the
 * gated fetch is replaced by a switch so each endpoint can be declared live
 * or fallback per test.
 */

const gate = vi.hoisted(() => ({ live: {} as Record<string, boolean> }));

vi.mock("next/dynamic", () => ({
  default: () =>
    function MapStub() {
      return <div data-testid="map-stub" />;
    },
}));
vi.mock("@/components/dashboard/ThemeToggle", () => ({ default: () => null }));
vi.mock("@/components/auth/VerificationBanner", () => ({ default: () => null }));
vi.mock("@/lib/use-gated-data", () => ({
  useGatedData: (endpoint: string, fallback: unknown) => ({
    data: fallback,
    isLoading: false,
    isLive: gate.live[endpoint] ?? false,
  }),
}));

import Home from "@/app/app/page";

const SAMPLE = SOURCES.sample.label;
const REAL_SOURCE_STRINGS = ["不動産情報ライブラリ", "e-Stat", "国勢調査", "国土数値情報", "ハザードマップポータル"];

// Live-fetched on the current code path (backend/routers/data.py + the
// client-side tiles in MapView): REINFOLIB, e-Stat, ODPT, GSI hazard tiles,
// CARTO/OSM basemap, dataofjapan boundaries. Nothing fetches these two.
const NOT_LIVE_SOURCES = [SOURCES.ksj.label, SOURCES.disastershield.label];

const OLD_BLANKET_FOOTER = "出典: 不動産情報ライブラリ（国土交通省, 2024年） ／ e-Stat";

// Ruling 1: REINFOLIB stays in the live group, but nothing draws it yet.
const FETCHED_NOT_SHOWN = "取得済み・現時点では未表示";

function keyMetric(container: HTMLElement, caption: string): HTMLElement {
  const tiles = [...container.querySelectorAll<HTMLElement>(".key-metric")];
  const tile = tiles.find((t) => (t.textContent ?? "").includes(caption));
  if (!tile) throw new Error(`no .key-metric containing "${caption}"`);
  return tile;
}

beforeEach(() => {
  gate.live = {};
});

describe("用途地域 tab — hardcoded sampleZoning", () => {
  it("shows the sample label and no 国土数値情報", () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("tab", { name: "用途地域" }));
    const panel = screen.getByRole("tabpanel");
    const text = panel.textContent ?? "";
    expect(text).toContain(SAMPLE);
    for (const real of REAL_SOURCE_STRINGS) expect(text).not.toContain(real);
  });
});

describe("key metrics consume isLive", () => {
  it("all fallback → every tile carries the sample label", () => {
    const { container } = render(<Home />);
    expect(keyMetric(container, "成長率").textContent).toContain(SAMPLE);
    expect(keyMetric(container, "高リスク").textContent).toContain(SAMPLE);
    expect(keyMetric(container, "乗降客").textContent).toContain(SAMPLE);
  });

  it("demographics + transport live, disaster fallback → only 高リスク is labelled", () => {
    gate.live = {
      "/api/v1/demographics": true,
      "/api/v1/transport": true,
      "/api/v1/disaster-risks": false,
    };
    const { container } = render(<Home />);
    expect(keyMetric(container, "成長率").textContent).not.toContain(SAMPLE);
    expect(keyMetric(container, "乗降客").textContent).not.toContain(SAMPLE);
    expect(keyMetric(container, "高リスク").textContent).toContain(SAMPLE);
  });
});

describe("dashboard footer — per-surface truth, two groups", () => {
  it("has a live group and a sample group, and no source that is not fetched", () => {
    const { container } = render(<Home />);
    const footer = container.querySelector("footer");
    expect(footer).not.toBeNull();
    const text = footer!.textContent ?? "";

    const live = footer!.querySelector('[data-provenance="live"]');
    const sample = footer!.querySelector('[data-provenance="sample"]');
    expect(live).not.toBeNull();
    expect(sample).not.toBeNull();
    expect(sample!.textContent).toContain(SAMPLE);

    for (const label of NOT_LIVE_SOURCES) expect(text).not.toContain(label);
    expect(text).not.toContain(OLD_BLANKET_FOOTER);

    // Ruling 1: REINFOLIB is fetched by the code path and shown nowhere.
    expect(live!.textContent).toContain(SOURCES.reinfolib.label);
    expect(live!.textContent).toContain(FETCHED_NOT_SHOWN);
    expect(text).not.toContain("概算中心");
    // Ruling 2: the bundled station file is not a real-data source.
    expect(live!.textContent).not.toContain("出典未確認");
  });
});

describe("map legend for station bubbles consumes transport isLive (ruling 4)", () => {
  const legendText = (container: HTMLElement) =>
    [...container.querySelectorAll<HTMLElement>(".map-overlay")].map((el) => el.textContent ?? "").join("\n");

  it("transport fallback → the 乗降客数 legend carries the sample label", () => {
    const { container } = render(<Home />);
    fireEvent.click(screen.getByRole("tab", { name: "交通" }));
    expect(legendText(container)).toContain(SAMPLE);
  });

  it("transport live → the 乗降客数 legend carries no sample label", () => {
    gate.live = { "/api/v1/transport": true };
    const { container } = render(<Home />);
    fireEvent.click(screen.getByRole("tab", { name: "交通" }));
    expect(legendText(container)).not.toContain(SAMPLE);
  });
});
