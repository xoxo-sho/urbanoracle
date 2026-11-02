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
 * e-Stat 利用規約 1)イ for the 人口推移 chart (real-data plan PR 3): the 23-ward
 * totals are sums over the ward rows of the 時系列 第6表 workbook (2000–2020) and
 * of the 2025 確報 population table. The same sentence is recorded in the
 * snapshot's `credit.edited` (backend/data/population_trends.json).
 */
export const ESTAT_TREND_EDITED = "「国勢調査 時系列データ」「令和7年国勢調査 人口等基本集計」（総務省統計局）を加工して作成";

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

/**
 * 国土数値情報 利用規約 1)ア 出典記載例 and 1)イ edit statement, for the station
 * snapshot (real-data plan PR 4: 駅別乗降客数データ S12 and 行政区域データ N03).
 * Architect decision 12 (2026-11-02): every KSJ credit is the 加工 form with no
 * editor name. The same sentences are recorded in the snapshot's `credit`
 * (backend/data/stations.json).
 */
export const KSJ_SITE_URL = "https://nlftp.mlit.go.jp/ksj/";
export const KSJ_SOURCE = `出典：国土交通省国土数値情報ダウンロードサイト（${KSJ_SITE_URL}）`;
export const KSJ_SOURCE_EN =
  "Translation: Source: National Land Numerical Information download site, Ministry of Land, Infrastructure, Transport and Tourism (https://nlftp.mlit.go.jp/ksj/).";
export const KSJ_S12_EDITED = `「国土数値情報（駅別乗降客数データ）」（国土交通省）（${KSJ_SITE_URL}）を加工して作成`;
export const KSJ_S12_EDITED_EN =
  "Translation: Created by processing the National Land Numerical Information (station ridership data), Ministry of Land, Infrastructure, Transport and Tourism (https://nlftp.mlit.go.jp/ksj/).";
export const KSJ_N03_EDITED = `「国土数値情報（行政区域データ）」（国土交通省）（${KSJ_SITE_URL}）を加工して作成`;
export const KSJ_N03_EDITED_EN =
  "Translation: Created by processing the National Land Numerical Information (administrative area data), Ministry of Land, Infrastructure, Transport and Tourism (https://nlftp.mlit.go.jp/ksj/).";

/**
 * What a 乗降客数 figure is (real-data plan PR 4): the snapshot sums each
 * operator's own count, so a transfer passenger is counted once per
 * operator, as the source counts them; and the JR東日本 rows of S12 are the
 * published 乗車人員 doubled (measured against JR East's own pages for five
 * stations, two years). Both sentences come from the snapshot's `notes`.
 */
export const RIDERSHIP_DEFINITION_NOTE = "事業者ごとの駅別乗降客数の合計（乗換客は事業者ごとに数えられます）";
export const RIDERSHIP_JR_NOTE = "JR東日本の値は乗車人員を2倍した値（原典資料による）";

/** dataofjapan/land README: name the upstream, 地球地図日本. */
export const BOUNDARY_SOURCE = "dataofjapan/land（出典：地球地図日本）";
export const WARD_BOUNDARY_CREDIT = `区境界: ${BOUNDARY_SOURCE}`;

/** 地理院タイル一覧: name 「地理院タイル」 and link the tile list page. */
export const GSI_TILES_NAME = "地理院タイル";
export const GSI_TILE_LIST_URL = "https://maps.gsi.go.jp/development/ichiran.html";
/** 国土地理院コンテンツ利用規約 1)イ: the dark theme recolours the tiles, which is processing. */
export const GSI_PALE_PROCESSED = "地理院タイル（淡色地図）を加工して作成";
