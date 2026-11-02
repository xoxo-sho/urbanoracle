import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import LandingPage from "@/app/page";

/**
 * Required credits and notices on the public landing page
 * (RECON 2026-10-data-terms §7.1). The Japanese text is prescribed and stays
 * verbatim in both languages; the English page adds a translation, marked as
 * one, after each prescribed sentence.
 */

const ESTAT_API_CREDIT =
  "このサービスは、政府統計総合窓口(e-Stat)のAPI機能を使用していますが、サービスの内容は国によって保証されたものではありません。";
const KSJ_SOURCE = "出典：国土交通省国土数値情報ダウンロードサイト（https://nlftp.mlit.go.jp/ksj/）";
const KSJ_S12_EDITED = "「国土数値情報（駅別乗降客数データ）」（国土交通省）（https://nlftp.mlit.go.jp/ksj/）を加工して作成";
const KSJ_N03_EDITED = "「国土数値情報（行政区域データ）」（国土交通省）（https://nlftp.mlit.go.jp/ksj/）を加工して作成";
const KSJ_L01_EDITED = "「国土数値情報（地価公示データ）」（国土交通省）（https://nlftp.mlit.go.jp/ksj/）を加工して作成";
const RETIRED = "OD" + "PT";
const RETIRED_JA = "公共交通オープン" + "データ";
const BOUNDARY_SOURCE = "dataofjapan/land（出典：地球地図日本）";

const ESTAT_API_CREDIT_EN =
  "Translation: This service uses the API function of e-Stat, the Portal Site of Official Statistics of Japan, but the content of the service is not guaranteed by the national government.";
const KSJ_SOURCE_EN =
  "Translation: Source: National Land Numerical Information download site, Ministry of Land, Infrastructure, Transport and Tourism (https://nlftp.mlit.go.jp/ksj/).";
const KSJ_S12_EDITED_EN =
  "Translation: Created by processing the National Land Numerical Information (station ridership data), Ministry of Land, Infrastructure, Transport and Tourism (https://nlftp.mlit.go.jp/ksj/).";
const KSJ_N03_EDITED_EN =
  "Translation: Created by processing the National Land Numerical Information (administrative area data), Ministry of Land, Infrastructure, Transport and Tourism (https://nlftp.mlit.go.jp/ksj/).";
const KSJ_L01_EDITED_EN =
  "Translation: Created by processing the National Land Numerical Information (published land price data), Ministry of Land, Infrastructure, Transport and Tourism (https://nlftp.mlit.go.jp/ksj/).";

function sourcesSection(container: HTMLElement): HTMLElement {
  const table = container.querySelector("table");
  const section = table?.closest("section");
  if (!section) throw new Error("no データ出典 section");
  return section as HTMLElement;
}

afterEach(() => {
  window.localStorage.clear();
});

describe("landing page データ出典 — Japanese", () => {
  it("carries the e-Stat API credit and the 国土数値情報 出典 line with both 加工 statements; nothing names the retired source", () => {
    const { container } = render(<LandingPage />);
    const text = sourcesSection(container).textContent ?? "";
    expect(text).toContain(ESTAT_API_CREDIT);
    expect(text).toContain(KSJ_SOURCE);
    expect(text).toContain(KSJ_S12_EDITED);
    expect(text).toContain(KSJ_N03_EDITED);
    expect(text).toContain(KSJ_L01_EDITED);
    expect(text).not.toMatch(/をもとに.*作成/);
    expect(container.textContent).not.toContain(RETIRED);
    expect(container.textContent).not.toContain(RETIRED_JA);
    expect(container.textContent).not.toContain("同梱データ（出典未確認）");
  });

  it("names 地球地図日本 for the boundaries and 地理院タイル for the map tiles, and no longer CARTO, OpenStreetMap or 不動産情報ライブラリ", () => {
    const { container } = render(<LandingPage />);
    const text = container.textContent ?? "";
    expect(sourcesSection(container).textContent).toContain(BOUNDARY_SOURCE);
    expect(sourcesSection(container).textContent).toContain("地理院タイル");
    expect(text).not.toContain("CARTO");
    expect(text).not.toContain("OpenStreetMap");
    expect(text).not.toContain("不動産情報ライブラリ");
  });
});

describe("landing page データ出典 — English", () => {
  it("keeps each prescribed Japanese sentence verbatim and follows it with a marked translation", async () => {
    window.localStorage.setItem("urbanoracle.lang", "en");
    const { container } = render(<LandingPage />);
    await screen.findByText("Data sources");
    const text = sourcesSection(container).textContent ?? "";
    expect(text).toContain(ESTAT_API_CREDIT);
    expect(text).toContain(ESTAT_API_CREDIT_EN);
    expect(text.indexOf(ESTAT_API_CREDIT_EN)).toBeGreaterThan(text.indexOf(ESTAT_API_CREDIT));
    for (const [ja, en] of [
      [KSJ_SOURCE, KSJ_SOURCE_EN],
      [KSJ_S12_EDITED, KSJ_S12_EDITED_EN],
      [KSJ_N03_EDITED, KSJ_N03_EDITED_EN],
      [KSJ_L01_EDITED, KSJ_L01_EDITED_EN],
    ]) {
      expect(text).toContain(ja);
      expect(text).toContain(en);
      expect(text.indexOf(en)).toBeGreaterThan(text.indexOf(ja));
    }
  });
});
