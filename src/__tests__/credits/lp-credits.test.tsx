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
const ODPT_NOTICE =
  "本アプリケーションが利用する公共交通データは、公共交通オープンデータセンターにおいて提供されるものです。公共交通事業者により提供されたデータを元にしていますが、必ずしも正確・完全なものとは限りません。本アプリケーションの表示内容について、公共交通事業者への直接の問合せは行わないでください。本アプリケーションに関するお問い合わせは、以下のメールアドレスにお願いします。";
const CONTACT = "contact@dxalabs.com";
const TOEI_CC_BY =
  "このアプリは、以下の著作物を改変して利用しています。 東京都交通局・公共交通オープンデータ協議会、乗降者数情報、クリエイティブ・コモンズ・ライセンス　表示4.0国際（https://creativecommons.org/licenses/by/4.0/deed.ja）";
const BOUNDARY_SOURCE = "dataofjapan/land（出典：地球地図日本）";

const ESTAT_API_CREDIT_EN =
  "Translation: This service uses the API function of e-Stat, the Portal Site of Official Statistics of Japan, but the content of the service is not guaranteed by the national government.";
const ODPT_NOTICE_EN =
  "Translation: The public transport data used by this application is provided by the Public Transportation Open Data Center. It is based on data provided by public transport operators but is not necessarily accurate or complete. Please do not contact the public transport operators directly about what this application shows. Please send enquiries about this application to the email address below.";
const TOEI_CC_BY_EN =
  "Translation: This app uses the following work in modified form: Bureau of Transportation, Tokyo Metropolitan Government and the Association for Open Data of Public Transportation, passenger survey data, Creative Commons Attribution 4.0 International (https://creativecommons.org/licenses/by/4.0/deed.ja).";

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
  it("carries the e-Stat API credit, the ODPT notice with contact@dxalabs.com and the 東京都交通局 CC BY credit", () => {
    const { container } = render(<LandingPage />);
    const text = sourcesSection(container).textContent ?? "";
    expect(text).toContain(ESTAT_API_CREDIT);
    expect(text).toContain(ODPT_NOTICE);
    expect(text).toContain(CONTACT);
    expect(text).toContain(TOEI_CC_BY);
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
    expect(text).toContain(ODPT_NOTICE);
    expect(text).toContain(ODPT_NOTICE_EN);
    expect(text.indexOf(ODPT_NOTICE_EN)).toBeGreaterThan(text.indexOf(ODPT_NOTICE));
    expect(text).toContain(TOEI_CC_BY);
    expect(text).toContain(TOEI_CC_BY_EN);
    expect(text.indexOf(TOEI_CC_BY_EN)).toBeGreaterThan(text.indexOf(TOEI_CC_BY));
  });
});
