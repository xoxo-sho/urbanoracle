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
const KSJ_A55_EDITED = "「国土数値情報（都市計画決定情報データ）」（国土交通省）（https://nlftp.mlit.go.jp/ksj/）を加工して作成";
// The A55 page's 【重要：データ利用時の注意事項】 (real-data plan PR 6), word for word.
const A55_NOTICES = [
  "本データは、建築確認申請や不動産重要事項説明等の手続に用いることを保証するものではなく、参考情報としての利用を想定しています。",
  "本データに含まれる地区・地域の範囲は、概ねの位置を示すものであり、実際の都市計画の決定範囲等と異なる場合があります。",
  "本データは、当該自治体の都市計画等の情報全てではないことがあります。",
  "本データは、最新の情報ではないことがあります。本データの時点については、公表自治体及び掲載データ一覧を参考にしてください。",
  "最新の正確な都市計画決定情報が必要な場合は、該当する地方公共団体の担当課までお問い合わせください。",
  "本データを用いて行う一切の行為（コンテンツを編集・加工等した情報を利用することを含む）及び本データの利用によって発生した直接または間接の損失、損害等について、国土交通省並びに原典資料提供元の地方公共団体は一切の責任を負いません。",
];
// Real-data plan PR 7: the 東京都 CC BY credit (東京都オープンデータ利用規約 2(1)ア/イ),
// the four hazard datasets' 加工 lines and the hazard-map portal's 出典 line, word for word.
const KIKENDO_EDITED =
  "このサービスは、以下の著作物を改変して利用しています。地震に関する地域危険度測定調査（第9回）地域危険度一覧（令和4年9月公表）、東京都、クリエイティブ・コモンズ・ライセンス 表示4.0国際（https://creativecommons.org/licenses/by/4.0/deed.ja）";
const KSJ_A31_EDITED = "「国土数値情報（洪水浸水想定区域データ）」（国土交通省）（https://nlftp.mlit.go.jp/ksj/）を加工して作成";
const KSJ_A33_EDITED = "「国土数値情報（土砂災害警戒区域データ）」（国土交通省）（https://nlftp.mlit.go.jp/ksj/）を加工して作成";
const KSJ_A40_EDITED = "「国土数値情報（津波浸水想定データ）」（国土交通省）（https://nlftp.mlit.go.jp/ksj/）を加工して作成";
const KSJ_A49_EDITED = "「国土数値情報（高潮浸水想定区域データ）」（国土交通省）（https://nlftp.mlit.go.jp/ksj/）を加工して作成";
const HAZARD_PORTAL_SOURCE = "出典：ハザードマップポータルサイト";
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
const KSJ_A55_EDITED_EN =
  "Translation: Created by processing the National Land Numerical Information (city planning decision data), Ministry of Land, Infrastructure, Transport and Tourism (https://nlftp.mlit.go.jp/ksj/).";
const A55_NOTICE_ASOF_EN =
  "Translation: This data may not be the latest information. For the date each dataset reflects, refer to the list of publishing municipalities and published data.";

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
    expect(text).toContain(KSJ_A55_EDITED);
    for (const line of [KIKENDO_EDITED, KSJ_A31_EDITED, KSJ_A33_EDITED, KSJ_A40_EDITED, KSJ_A49_EDITED, HAZARD_PORTAL_SOURCE]) expect(text).toContain(line);
    for (const notice of A55_NOTICES) expect(text).toContain(notice);
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
      [KSJ_A55_EDITED, KSJ_A55_EDITED_EN],
      [A55_NOTICES[3], A55_NOTICE_ASOF_EN],
      [KIKENDO_EDITED, "Translation: Earthquake regional risk survey (9th)"],
      [KSJ_A31_EDITED, "Translation: Created by processing the National Land Numerical Information (flood inundation area data)"],
      [KSJ_A33_EDITED, "Translation: Created by processing the National Land Numerical Information (sediment disaster warning area data)"],
      [KSJ_A40_EDITED, "Translation: Created by processing the National Land Numerical Information (tsunami inundation data)"],
      [KSJ_A49_EDITED, "Translation: Created by processing the National Land Numerical Information (storm surge inundation area data)"],
      [HAZARD_PORTAL_SOURCE, "Translation: Source: Hazard Map Portal Site"],
    ]) {
      expect(text).toContain(ja);
      expect(text).toContain(en);
      expect(text.indexOf(en)).toBeGreaterThan(text.indexOf(ja));
    }
  });
});
