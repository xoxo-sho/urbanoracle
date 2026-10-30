import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

/**
 * Required credits and notices on /app (RECON 2026-10-data-terms §7.1).
 *
 * The prescribed sentences are compared verbatim: e-Stat's API credit (API
 * terms 第7条 + credit page), ODPT's notice for published applications
 * (developer guideline 3.1) and the CC BY credit for 東京都交通局 data (ODPT
 * FAQ), the 取得日時 the guideline asks for (2.2.1), and the boundary credit
 * dataofjapan/land asks for. Every endpoint is reported live here, as it is
 * in production when the upstream answers.
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
  const { DEMOGRAPHICS_FIXTURE, STATIONS_FIXTURE } = await import("@/__tests__/fixtures/live-data");
  return {
    useGatedData: (endpoint: string) => {
      gate.requested.push(endpoint);
      const live = endpoint !== "/api/v1/disaster-risks";
      return {
        status: "ok",
        data:
          endpoint === "/api/v1/demographics"
            ? DEMOGRAPHICS_FIXTURE
            : endpoint === "/api/v1/transport"
              ? STATIONS_FIXTURE
              : null,
        unavailable: [],
        isLive: live,
        fetchedAt: endpoint === "/api/v1/transport" ? "2026-10-17T05:30:00+00:00" : null,
      };
    },
  };
});

import Home from "@/app/app/page";

const ESTAT_API_CREDIT =
  "このサービスは、政府統計総合窓口(e-Stat)のAPI機能を使用していますが、サービスの内容は国によって保証されたものではありません。";
const ESTAT_SOURCE = "出典：政府統計の総合窓口(e-Stat)（https://www.e-stat.go.jp/）";
const ESTAT_EDITED = "「令和2年国勢調査」「令和7年国勢調査 人口速報集計」（総務省統計局）を加工して作成";
const ODPT_NOTICE =
  "本アプリケーションが利用する公共交通データは、公共交通オープンデータセンターにおいて提供されるものです。公共交通事業者により提供されたデータを元にしていますが、必ずしも正確・完全なものとは限りません。本アプリケーションの表示内容について、公共交通事業者への直接の問合せは行わないでください。本アプリケーションに関するお問い合わせは、以下のメールアドレスにお願いします。";
const CONTACT = "contact@dxalabs.com";
const TOEI_CC_BY =
  "このアプリは、以下の著作物を改変して利用しています。 東京都交通局・公共交通オープンデータ協議会、乗降者数情報、クリエイティブ・コモンズ・ライセンス　表示4.0国際（https://creativecommons.org/licenses/by/4.0/deed.ja）";
const FETCHED_AT = "取得日時: 2026-10-17 14:30（日本時間）";
const WARD_CREDIT = "区境界: dataofjapan/land（出典：地球地図日本）";

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

describe("/app 交通 tab — ODPT notices next to the station data", () => {
  it("shows the ODPT notice with contact@dxalabs.com as a mailto link", () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("tab", { name: "交通" }));
    const panel = screen.getByRole("tabpanel");
    expect(panel.textContent).toContain(ODPT_NOTICE);
    const link = within(panel).getByRole("link", { name: CONTACT });
    expect(link.getAttribute("href")).toBe(`mailto:${CONTACT}`);
  });

  it("shows the 取得日時 of the ODPT data in Japan time", () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("tab", { name: "交通" }));
    expect(screen.getByRole("tabpanel").textContent).toContain(FETCHED_AT);
  });

  it("shows the CC BY 4.0 credit for 東京都交通局 data", () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("tab", { name: "交通" }));
    expect(screen.getByRole("tabpanel").textContent).toContain(TOEI_CC_BY);
  });
});

describe("/app data requests", () => {
  it("does not request /api/v1/land-prices", () => {
    render(<Home />);
    expect(gate.requested).not.toContain("/api/v1/land-prices");
    expect(gate.requested).toContain("/api/v1/demographics");
  });
});
