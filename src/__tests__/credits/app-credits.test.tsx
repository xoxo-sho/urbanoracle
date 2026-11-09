import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

/**
 * Required credits and notices on /app (RECON 2026-10-data-terms §7.1).
 *
 * The prescribed sentences are compared verbatim: e-Stat's API credit (API
 * terms 第7条 + credit page), the 国土数値情報 出典 line and the two 加工
 * statements for the station snapshot (利用規約 1)ア / 1)イ, Architect
 * decision 12: no editor name), and the boundary credit dataofjapan/land
 * asks for. Every endpoint is reported live here, as it is in production
 * when the upstream answers.
 */

const gate = vi.hoisted(() => ({ requested: [] as string[] }));

vi.mock("next/dynamic", () => ({
  default: () =>
    function MapStub() {
      return <div data-testid="map-stub" />;
    },
}));
vi.mock("@/components/dashboard/ThemeToggle", () => ({ default: () => null }));
vi.mock("@/components/auth/VerificationBanner", () => ({ default: () => null }));
vi.mock("@/components/auth/SignOutButton", () => ({ default: () => null }));
// Every endpoint answered: the two live ones with real-shaped fixtures,
// /disaster-risks with nothing (the page keeps its sample set for that one
// until real-data plan PR 7).
vi.mock("@/lib/use-gated-data", async () => {
  const {
    DEMOGRAPHICS_FIXTURE,
    DEMOGRAPHICS_SOURCES,
    LAND_PRICES_FIXTURE,
    LAND_PRICES_SOURCES,
    STATIONS_FIXTURE,
    TRANSPORT_SOURCES,
    ZONING_FIXTURE,
    ZONING_SOURCES,
    ZONING_TOTAL,
  } = await import("@/__tests__/fixtures/live-data");
  const answers: Record<string, { data: unknown; sources: Record<string, unknown>; total?: unknown }> = {
    "/api/v1/demographics": { data: DEMOGRAPHICS_FIXTURE, sources: DEMOGRAPHICS_SOURCES },
    "/api/v1/transport": { data: STATIONS_FIXTURE, sources: TRANSPORT_SOURCES },
    "/api/v1/land-prices": { data: LAND_PRICES_FIXTURE, sources: LAND_PRICES_SOURCES },
    "/api/v1/zoning": { data: ZONING_FIXTURE, sources: ZONING_SOURCES, total: ZONING_TOTAL },
  };
  return {
    useGatedData: (endpoint: string) => {
      gate.requested.push(endpoint);
      return {
        status: "ok",
        data: answers[endpoint]?.data ?? null,
        unavailable: [],
        fetchedAt: null,
        sources: answers[endpoint]?.sources ?? {},
        total: answers[endpoint]?.total ?? null,
      };
    },
  };
});

import Home from "@/app/app/page";

const ESTAT_API_CREDIT =
  "このサービスは、政府統計総合窓口(e-Stat)のAPI機能を使用していますが、サービスの内容は国によって保証されたものではありません。";
const ESTAT_SOURCE = "出典：政府統計の総合窓口(e-Stat)（https://www.e-stat.go.jp/）";
const ESTAT_EDITED = "「令和7年国勢調査 人口等基本集計」（総務省統計局）を加工して作成";
const KSJ_SOURCE = "出典：国土交通省国土数値情報ダウンロードサイト（https://nlftp.mlit.go.jp/ksj/）";
const KSJ_S12_EDITED = "「国土数値情報（駅別乗降客数データ）」（国土交通省）（https://nlftp.mlit.go.jp/ksj/）を加工して作成";
const KSJ_N03_EDITED = "「国土数値情報（行政区域データ）」（国土交通省）（https://nlftp.mlit.go.jp/ksj/）を加工して作成";
const KSJ_L01_EDITED = "「国土数値情報（地価公示データ）」（国土交通省）（https://nlftp.mlit.go.jp/ksj/）を加工して作成";
const KSJ_A55_EDITED = "「国土数値情報（都市計画決定情報データ）」（国土交通省）（https://nlftp.mlit.go.jp/ksj/）を加工して作成";
// The A55 page's 【重要：データ利用時の注意事項】 (real-data plan PR 6), word for word.
const A55_NOTICE_ASOF = "本データは、最新の情報ではないことがあります。本データの時点については、公表自治体及び掲載データ一覧を参考にしてください。";
const A55_NOTICE_COUNT = 6;
const RETIRED = "OD" + "PT";
const WARD_CREDIT = "区境界: dataofjapan/land（出典：地球地図日本）";
// 国土地理院コンテンツ利用規約 1)ア / 1)イ: the ward areas under the density come from the 面積調.
const MENCHO_SOURCE = "出典：国土地理院ウェブサイト（https://www.gsi.go.jp/KOKUJYOHO/MENCHO-title.htm）";
const MENCHO_EDITED = "「令和7年全国都道府県市区町村別面積調（10月1日時点）」（国土地理院）を加工して作成";

function dataSources(container: HTMLElement): HTMLElement {
  const footer = container.querySelector<HTMLElement>("footer");
  if (!footer) throw new Error("no <footer> data-sources area");
  return footer;
}

beforeEach(() => {
  gate.requested = [];
});

describe("/app データ出典 / Data sources area", () => {
  it("is headed データ出典 / Data sources", () => {
    const { container } = render(<Home />);
    expect(dataSources(container).textContent).toContain("データ出典 / Data sources");
  });

  it("carries the e-Stat API credit sentence, the e-Stat 出典 line and the 加工 statement", () => {
    const { container } = render(<Home />);
    const text = dataSources(container).textContent ?? "";
    expect(text).toContain(ESTAT_API_CREDIT);
    expect(text).toContain(ESTAT_SOURCE);
    expect(text).toContain(ESTAT_EDITED);
  });

  it("credits the 面積調 under the density: the 国土地理院 出典 line and the 加工 statement", () => {
    const { container } = render(<Home />);
    const text = dataSources(container).textContent ?? "";
    expect(text).toContain(MENCHO_SOURCE);
    expect(text).toContain(MENCHO_EDITED);
  });

  it("credits the ward boundaries to dataofjapan/land with 地球地図日本 named", () => {
    const { container } = render(<Home />);
    expect(dataSources(container).textContent).toContain(WARD_CREDIT);
  });

  it("names 地理院タイル as the map tiles and no longer names CARTO or OpenStreetMap", () => {
    const { container } = render(<Home />);
    const text = dataSources(container).textContent ?? "";
    expect(text).toContain("地理院タイル");
    expect(text).not.toContain("CARTO");
    expect(text).not.toContain("OpenStreetMap");
  });

  it("no longer names 不動産情報ライブラリ", () => {
    const { container } = render(<Home />);
    expect(dataSources(container).textContent).not.toContain("不動産情報ライブラリ");
  });
});

describe("/app 人口 tab", () => {
  it("shows the e-Stat 出典 line, the 加工 statement and the API credit sentence beside the census figures", () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("tab", { name: "人口" }));
    const text = screen.getByRole("tabpanel").textContent ?? "";
    expect(text).toContain(ESTAT_SOURCE);
    expect(text).toContain(ESTAT_EDITED);
    expect(text).toContain(ESTAT_API_CREDIT);
  });
});

describe("/app 交通 tab — the 国土数値情報 credits next to the station data", () => {
  it("shows the 出典 line and both 加工 statements, in the form with no editor name", () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("tab", { name: "交通" }));
    const panel = screen.getByRole("tabpanel");
    const credit = within(panel).getByText(KSJ_S12_EDITED).closest('[data-credit="ksj"]');
    expect(credit).not.toBeNull();
    const text = credit!.textContent ?? "";
    expect(text).toContain(KSJ_SOURCE);
    expect(text).toContain(KSJ_S12_EDITED);
    expect(text).toContain(KSJ_N03_EDITED);
    expect(text).not.toMatch(/をもとに.*作成/);
  });

  it("names no retired source and no bundled-data note", () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("tab", { name: "交通" }));
    const text = screen.getByRole("tabpanel").textContent ?? "";
    expect(text).not.toContain(RETIRED);
    expect(text).not.toContain("同梱データ（出典未確認）");
  });
});

describe("/app 地価 tab — the 国土数値情報 credit next to the 地価公示 figures (real-data plan PR 5)", () => {
  it("shows the 出典 line and the 加工 statement for 地価公示データ, in the form with no editor name", () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("tab", { name: "地価" }));
    const panel = screen.getByRole("tabpanel");
    const credit = within(panel).getByText(KSJ_L01_EDITED).closest('[data-credit="ksj-l01"]');
    expect(credit).not.toBeNull();
    const text = credit!.textContent ?? "";
    expect(text).toContain(KSJ_SOURCE);
    expect(text).toContain(KSJ_L01_EDITED);
    expect(text).not.toMatch(/をもとに.*作成/);
    expect(panel.querySelector('[data-provenance="sample"]')).toBeNull();
  });
});

describe("/app 用途地域 tab — the 国土数値情報 credits and 注意事項 next to the A55-24 figures (real-data plan PR 6)", () => {
  it("shows the 出典 line and both 加工 statements, in the form with no editor name, and the six 注意事項", () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("tab", { name: "用途地域" }));
    const panel = screen.getByRole("tabpanel");
    const credit = within(panel).getByText(KSJ_A55_EDITED).closest('[data-credit="ksj-a55"]');
    expect(credit).not.toBeNull();
    const text = credit!.textContent ?? "";
    expect(text).toContain(KSJ_SOURCE);
    expect(text).toContain(KSJ_A55_EDITED);
    expect(text).toContain(KSJ_N03_EDITED);
    expect(text).not.toMatch(/をもとに.*作成/);
    const notices = panel.querySelectorAll('[data-notices="a55"] li');
    expect(notices).toHaveLength(A55_NOTICE_COUNT);
    expect(panel.textContent).toContain(A55_NOTICE_ASOF);
    expect(panel.querySelector('[data-provenance="sample"]')).toBeNull();
  });
});

describe("/app データ出典 — the 用途地域 snapshot", () => {
  it("carries the 加工 statement for 都市計画決定情報データ and the 注意事項 under 実データ; the sample group no longer lists 用途地域", () => {
    const { container } = render(<Home />);
    const live = container.querySelector('footer [data-provenance="live"]')?.textContent ?? "";
    expect(live).toContain(KSJ_A55_EDITED);
    expect(live).toContain("用途地域");
    expect(live).toContain(A55_NOTICE_ASOF);
    expect(container.querySelectorAll('footer [data-notices="a55"] li')).toHaveLength(A55_NOTICE_COUNT);
    const sample = container.querySelector('footer [data-provenance="sample"]')?.textContent ?? "";
    expect(sample).not.toContain("用途地域");
  });
});

describe("/app データ出典 — the 地価公示 snapshot", () => {
  it("carries the 加工 statement for 地価公示データ under 実データ", () => {
    const { container } = render(<Home />);
    const live = container.querySelector('footer [data-provenance="live"]')?.textContent ?? "";
    expect(live).toContain(KSJ_L01_EDITED);
    expect(live).toContain("地価公示");
    const sample = container.querySelector('footer [data-provenance="sample"]')?.textContent ?? "";
    expect(sample).not.toContain("区別平均地価");
  });
});

describe("/app データ出典 — the station snapshot", () => {
  it("carries the 国土数値情報 出典 line and both 加工 statements under 実データ", () => {
    const { container } = render(<Home />);
    const live = container.querySelector('footer [data-provenance="live"]')?.textContent ?? "";
    expect(live).toContain(KSJ_SOURCE);
    expect(live).toContain(KSJ_S12_EDITED);
    expect(live).toContain(KSJ_N03_EDITED);
    expect(dataSources(container).textContent).not.toContain(RETIRED);
    expect(dataSources(container).textContent).not.toContain("出典未確認");
  });
});

describe("/app data requests", () => {
  it("requests /api/v1/land-prices (the committed 地価公示 snapshot, real-data plan PR 5) and /api/v1/demographics", () => {
    render(<Home />);
    expect(gate.requested).toContain("/api/v1/land-prices");
    expect(gate.requested).toContain("/api/v1/zoning");
    expect(gate.requested).toContain("/api/v1/demographics");
  });
});
