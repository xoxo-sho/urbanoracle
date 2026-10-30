import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SOURCES } from "@/lib/sources";
import { FAILED_TEXT } from "@/components/dashboard/DataState";
import { DEMOGRAPHICS_FIXTURE, STATIONS_FIXTURE } from "@/__tests__/fixtures/live-data";

/**
 * Dashboard page truth (truth fix, Stage 1a/1b/1c; real-data plan PR 1).
 *
 * The page is rendered for real; only the things jsdom cannot host are
 * stubbed (the MapLibre canvas, the theme store, the auth banner and the
 * sign-out control — both need an AuthProvider this test does not mount) and the
 * gated fetch is replaced by a switch so each endpoint can be declared ok,
 * partial or unavailable per test.
 *
 * Flipped in PR 1: the hook has no fallback, so an endpoint that has not
 * answered is `unavailable` with no data — the page shows 取得失敗, never a
 * sample figure with a sample label. Only /disaster-risks still has a sample
 * set behind it (PR 7).
 */

type Partial = {
  status?: "loading" | "ok" | "partial" | "unavailable";
  data?: unknown;
  unavailable?: string[];
  isLive?: boolean;
  fetchedAt?: string | null;
};
const gate = vi.hoisted(() => ({ state: {} as Record<string, Partial> }));

vi.mock("next/dynamic", () => ({
  default: () =>
    function MapStub() {
      return <div data-testid="map-stub" />;
    },
}));
vi.mock("@/components/dashboard/ThemeToggle", () => ({ default: () => null }));
vi.mock("@/components/auth/VerificationBanner", () => ({ default: () => null }));
vi.mock("@/components/auth/SignOutButton", () => ({ default: () => null }));
vi.mock("@/lib/use-gated-data", () => ({
  useGatedData: (endpoint: string) => ({
    status: "unavailable",
    data: null,
    unavailable: [],
    isLive: false,
    fetchedAt: null,
    ...(gate.state[endpoint] ?? {}),
  }),
}));

import Home from "@/app/app/page";

const SAMPLE = SOURCES.sample.label;
const REAL_SOURCE_STRINGS = ["不動産情報ライブラリ", "e-Stat", "国勢調査", "国土数値情報", "ハザードマップポータル"];

// Live-fetched on the current code path (backend/routers/data.py + the
// client-side tiles in MapView): e-Stat, ODPT, GSI hazard tiles, the
// 地理院タイル basemap, dataofjapan boundaries. Nothing fetches these two.
const NOT_LIVE_SOURCES = [SOURCES.ksj.label, SOURCES.disastershield.label];

const OLD_BLANKET_FOOTER = "出典: 不動産情報ライブラリ（国土交通省, 2024年） ／ e-Stat";

// Ruling 1 (revised 2026-10, RECON 2026-10-data-terms UO-3): REINFOLIB was
// fetched and drawn nowhere, so the fetch was removed; the footer no longer
// names it.
const REMOVED_SOURCE = "不動産情報ライブラリ";

const LIVE = {
  "/api/v1/demographics": { status: "ok", data: DEMOGRAPHICS_FIXTURE, isLive: true },
  "/api/v1/transport": { status: "ok", data: STATIONS_FIXTURE, isLive: true, fetchedAt: "2026-10-17T05:30:00+00:00" },
} satisfies Record<string, Partial>;

function keyMetric(container: HTMLElement, caption: string): HTMLElement {
  const tiles = [...container.querySelectorAll<HTMLElement>(".key-metric")];
  const tile = tiles.find((t) => (t.textContent ?? "").includes(caption));
  if (!tile) throw new Error(`no .key-metric containing "${caption}"`);
  return tile;
}

beforeEach(() => {
  gate.state = {};
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

describe("key metrics consume status", () => {
  it("both live endpoints unavailable → 成長率 and 乗降客 say 取得失敗 with no sample label; 高リスク keeps its sample label", () => {
    const { container } = render(<Home />);
    for (const caption of ["成長率", "乗降客"]) {
      const tile = keyMetric(container, caption);
      expect(tile.textContent).toContain(FAILED_TEXT);
      expect(tile.textContent).not.toContain(SAMPLE);
    }
    expect(keyMetric(container, "高リスク").textContent).toContain(SAMPLE);
  });

  it("demographics + transport ok → figures, no sample label; 高リスク (still sample-fed) is labelled", () => {
    gate.state = LIVE;
    const { container } = render(<Home />);
    const growth = keyMetric(container, "成長率");
    expect(growth.textContent).toContain("0.0%");
    expect(growth.textContent).not.toContain(SAMPLE);
    const passengers = keyMetric(container, "乗降客");
    expect(passengers.textContent).toContain("0万");
    expect(passengers.textContent).not.toContain(SAMPLE);
    expect(keyMetric(container, "高リスク").textContent).toContain(SAMPLE);
  });
});

describe("dashboard footer — per-surface truth, two groups", () => {
  it("has a live group and a sample group, and no source that is not fetched", () => {
    gate.state = LIVE;
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

    // Ruling 1 (revised): the REINFOLIB fetch is gone, and so is its line.
    expect(text).not.toContain(REMOVED_SOURCE);
    expect(text).not.toContain("概算中心");
    // Ruling 2: the bundled station file is not a real-data source.
    expect(live!.textContent).not.toContain("出典未確認");
  });

  it("lists the two live surfaces under 実データ only when their endpoint answered in full", () => {
    gate.state = LIVE;
    const live = render(<Home />).container.querySelector('footer [data-provenance="live"]')!.textContent ?? "";
    expect(live).toContain("人口・密度・増減・年齢構成");
    expect(live).toContain("駅別乗降客数");
  });
});

describe("map legend for station bubbles consumes transport status (ruling 4, PR 1)", () => {
  const legendText = (container: HTMLElement) =>
    [...container.querySelectorAll<HTMLElement>(".map-overlay")].map((el) => el.textContent ?? "").join("\n");

  it("transport unavailable → the 乗降客数 legend says 取得失敗 and carries no sample label", () => {
    const { container } = render(<Home />);
    fireEvent.click(screen.getByRole("tab", { name: "交通" }));
    expect(legendText(container)).toContain(FAILED_TEXT);
    expect(legendText(container)).not.toContain(SAMPLE);
  });

  it("transport ok → the 乗降客数 legend cites ODPT and carries no sample label", () => {
    gate.state = LIVE;
    const { container } = render(<Home />);
    fireEvent.click(screen.getByRole("tab", { name: "交通" }));
    expect(legendText(container)).toContain(SOURCES.odpt.label);
    expect(legendText(container)).not.toContain(SAMPLE);
  });
});
