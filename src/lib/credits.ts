/**
 * Credits and notices the data providers prescribe (RECON 2026-10-data-terms
 * §3, §7.1). The Japanese strings are the providers' own wording and must stay
 * verbatim; tests compare them character for character. English surfaces show
 * the Japanese unchanged and then the translation below, which is marked as a
 * translation and has no standing of its own.
 */

/** e-Stat API 利用規約 第7条; wording from https://www.e-stat.go.jp/api/api-info/credit */
export const ESTAT_API_CREDIT =
  "このサービスは、政府統計総合窓口(e-Stat)のAPI機能を使用していますが、サービスの内容は国によって保証されたものではありません。";
export const ESTAT_API_CREDIT_EN =
  "Translation: This service uses the API function of e-Stat, the Portal Site of Official Statistics of Japan, but the content of the service is not guaranteed by the national government.";

/** e-Stat 利用規約 1)ア 出典記載例. */
export const ESTAT_SOURCE = "出典：政府統計の総合窓口(e-Stat)（https://www.e-stat.go.jp/）";

/** e-Stat 利用規約 1)イ: density and the rounded shares are computed from the census tables. */
export const ESTAT_EDITED = "「令和7年国勢調査 人口等基本集計」（総務省統計局）を加工して作成";

/**
 * 国土地理院コンテンツ利用規約 (令和7年11月20日改正, PDL1.0) 1)ア 出典記載例 and
 * 1)イ: the ward areas that divide the census population into a density come
 * from the 面積調 edition of the census date, and the quotient is 加工.
 */
export const MENCHO_PAGE_URL = "https://www.gsi.go.jp/KOKUJYOHO/MENCHO-title.htm";
export const MENCHO_EDITION = "令和7年全国都道府県市区町村別面積調（10月1日時点）";
export const MENCHO_SOURCE = `出典：国土地理院ウェブサイト（${MENCHO_PAGE_URL}）`;
export const MENCHO_EDITED = `「${MENCHO_EDITION}」（国土地理院）を加工して作成`;
/** The 面積調's own remarks on the 23 wards, carried so a density reader knows the denominator's caveats. */
export const MENCHO_REMARKS =
  "面積調の備考: 千代田・中央・港・葛飾・江戸川は境界の一部が未定のため参考値、江東・江戸川は荒川河口部を除く";

/** ODPT 公共交通オープンデータ開発者ガイドライン 3.1 (notice for a published application). */
export const ODPT_NOTICE =
  "本アプリケーションが利用する公共交通データは、公共交通オープンデータセンターにおいて提供されるものです。公共交通事業者により提供されたデータを元にしていますが、必ずしも正確・完全なものとは限りません。本アプリケーションの表示内容について、公共交通事業者への直接の問合せは行わないでください。本アプリケーションに関するお問い合わせは、以下のメールアドレスにお願いします。";
export const ODPT_NOTICE_EN =
  "Translation: The public transport data used by this application is provided by the Public Transportation Open Data Center. It is based on data provided by public transport operators but is not necessarily accurate or complete. Please do not contact the public transport operators directly about what this application shows. Please send enquiries about this application to the email address below.";
export const CONTACT_EMAIL = "contact@dxalabs.com";

/** ODPT FAQ, CC BY 4.0 data used in modified form; provider name from the 東京都交通局 catalog page. */
export const TOEI_CC_BY_CREDIT =
  "このアプリは、以下の著作物を改変して利用しています。 東京都交通局・公共交通オープンデータ協議会、乗降者数情報、クリエイティブ・コモンズ・ライセンス　表示4.0国際（https://creativecommons.org/licenses/by/4.0/deed.ja）";
export const TOEI_CC_BY_CREDIT_EN =
  "Translation: This app uses the following work in modified form: Bureau of Transportation, Tokyo Metropolitan Government and the Association for Open Data of Public Transportation, passenger survey data, Creative Commons Attribution 4.0 International (https://creativecommons.org/licenses/by/4.0/deed.ja).";

/** dataofjapan/land README: name the upstream, 地球地図日本. */
export const BOUNDARY_SOURCE = "dataofjapan/land（出典：地球地図日本）";
export const WARD_BOUNDARY_CREDIT = `区境界: ${BOUNDARY_SOURCE}`;

/** 地理院タイル一覧: name 「地理院タイル」 and link the tile list page. */
export const GSI_TILES_NAME = "地理院タイル";
export const GSI_TILE_LIST_URL = "https://maps.gsi.go.jp/development/ichiran.html";
/** 国土地理院コンテンツ利用規約 1)イ: the dark theme recolours the tiles, which is processing. */
export const GSI_PALE_PROCESSED = "地理院タイル（淡色地図）を加工して作成";

/** ODPT guideline 2.2.1: the 取得日時 of static data, in Japan time. */
export function formatFetchedAtJst(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  return `取得日時: ${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}（日本時間）`;
}
