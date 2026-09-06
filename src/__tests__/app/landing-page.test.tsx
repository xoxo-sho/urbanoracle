import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { SOURCES } from "@/lib/sources";
import LandingPage from "@/app/page";

/**
 * Landing page truth (truth fix, Stage 1a/1c).
 *
 * The LP is public and unauthenticated: it is the surface a stranger reads
 * first. Its hero is sample data and must say so; its データ出典 table must
 * list only what the current code path actually fetches, in two honest
 * groups — 実データ and サンプル（暫定） — and must not promise provenance
 * for "every figure" while some figures have none.
 */

const SAMPLE = SOURCES.sample.label;

// Live-fetched on the current code path: REINFOLIB (/api/v1/land-prices),
// e-Stat (/api/v1/demographics), ODPT (/api/v1/transport), GSI hazard tiles,
// CARTO/OSM basemap, dataofjapan boundaries. Nothing fetches these two.
const NOT_LIVE_SOURCES = [SOURCES.ksj.label, SOURCES.disastershield.label];

const FALSE_PROMISE = "表示するすべての数値に、出典・単位・年次を明示します";

// Ruling 1: REINFOLIB stays in the live group, but nothing draws it yet.
const FETCHED_NOT_SHOWN = "取得済み・現時点では未表示";

describe("landing page hero", () => {
  it("carries the sample label", () => {
    const { container } = render(<LandingPage />);
    expect(container.textContent).toContain(SAMPLE);
  });
});

describe("landing page データ出典 table", () => {
  it("has 実データ and サンプル groups and lists no source that is not fetched", () => {
    const { container } = render(<LandingPage />);
    const table = container.querySelector("table");
    expect(table).not.toBeNull();
    const text = table!.textContent ?? "";

    const live = table!.querySelector('[data-provenance="live"]');
    expect(live).not.toBeNull();
    expect(table!.querySelector('[data-provenance="sample"]')).not.toBeNull();
    expect(text).toContain(SAMPLE);
    for (const label of NOT_LIVE_SOURCES) expect(text).not.toContain(label);

    // Ruling 1: REINFOLIB is fetched by the code path and shown nowhere.
    expect(live!.textContent).toContain(SOURCES.reinfolib.label);
    expect(live!.textContent).toContain(FETCHED_NOT_SHOWN);
    // Ruling 2: the bundled station file is not a real-data source.
    expect(live!.textContent).not.toContain("出典未確認");
  });

  it("no source that nothing fetches, anywhere on the page (ruling 4: capability cards)", () => {
    const { container } = render(<LandingPage />);
    for (const label of NOT_LIVE_SOURCES) expect(container.textContent).not.toContain(label);
  });

  it("no note about a point display that does not exist (ruling 4: page.tsx:161)", () => {
    const { container } = render(<LandingPage />);
    expect(container.textContent).not.toContain("概算中心");
  });

  it("does not promise provenance for every figure", () => {
    const { container } = render(<LandingPage />);
    expect(container.textContent).not.toContain(FALSE_PROMISE);
  });
});

describe("copy guard — pages that cannot be rendered here", () => {
  // /login is a Firebase client and opengraph-image is an ImageResponse;
  // neither renders under jsdom, so their copy is checked at the source.
  const OLD_ATTRIBUTION = "出典: 不動産情報ライブラリ";
  const files = ["src/app/login/page.tsx", "src/app/opengraph-image.tsx"];

  for (const file of files) {
    it(`${file} has no 出典 line`, () => {
      const src = readFileSync(path.join(process.cwd(), file), "utf8");
      expect(src).not.toContain(OLD_ATTRIBUTION);
    });
  }
});
