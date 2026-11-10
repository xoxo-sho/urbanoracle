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
 * 国土数値情報 利用規約 1)イ for the 地価公示 snapshot (real-data plan PR 5:
 * 地価公示データ L01), the same 加工 form with no editor name (Architect
 * decision 12). Recorded in the snapshot's `credit.edited_l01`
 * (backend/data/land_prices.json).
 */
export const KSJ_L01_EDITED = `「国土数値情報（地価公示データ）」（国土交通省）（${KSJ_SITE_URL}）を加工して作成`;
export const KSJ_L01_EDITED_EN =
  "Translation: Created by processing the National Land Numerical Information (published land price data), Ministry of Land, Infrastructure, Transport and Tourism (https://nlftp.mlit.go.jp/ksj/).";
/**
 * 国土数値情報 利用規約 1)イ for the 用途地域 snapshot (real-data plan PR 6:
 * 都市計画決定情報データ A55, clipped to 行政区域データ N03), the same 加工 form
 * with no editor name (Architect decision 12). Recorded in the snapshot's
 * `credit.edited_a55` / `credit.edited_n03` (backend/data/zoning.json).
 */
export const KSJ_A55_EDITED = `「国土数値情報（都市計画決定情報データ）」（国土交通省）（${KSJ_SITE_URL}）を加工して作成`;
export const KSJ_A55_EDITED_EN =
  "Translation: Created by processing the National Land Numerical Information (city planning decision data), Ministry of Land, Infrastructure, Transport and Tourism (https://nlftp.mlit.go.jp/ksj/).";
/**
 * The A55 page's 【重要：データ利用時の注意事項】 (https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A55-2024.html,
 * read 2026-11-03), word for word — the page says they must be read before the
 * data is used, and RECON §9 row 6 requires them beside the figures. All six
 * are shown: each applies to a dashboard that derives area shares from the
 * extents (1, 2, 3, 6) and prints the data list's 時点 (4, 5). The same six
 * sentences are recorded in the snapshot's `notices`.
 */
export const A55_NOTICES_LABEL = "国土数値情報（都市計画決定情報データ）利用時の注意事項";
export const A55_NOTICES_LABEL_EN = "Translation: Notes on using the National Land Numerical Information (city planning decision data)";
export const A55_NOTICES = [
  "本データは、建築確認申請や不動産重要事項説明等の手続に用いることを保証するものではなく、参考情報としての利用を想定しています。",
  "本データに含まれる地区・地域の範囲は、概ねの位置を示すものであり、実際の都市計画の決定範囲等と異なる場合があります。",
  "本データは、当該自治体の都市計画等の情報全てではないことがあります。",
  "本データは、最新の情報ではないことがあります。本データの時点については、公表自治体及び掲載データ一覧を参考にしてください。",
  "最新の正確な都市計画決定情報が必要な場合は、該当する地方公共団体の担当課までお問い合わせください。",
  "本データを用いて行う一切の行為（コンテンツを編集・加工等した情報を利用することを含む）及び本データの利用によって発生した直接または間接の損失、損害等について、国土交通省並びに原典資料提供元の地方公共団体は一切の責任を負いません。",
] as const;
export const A55_NOTICES_EN = [
  "Translation: This data is not guaranteed for use in procedures such as building confirmation applications or explanations of important matters in real-estate transactions; it is intended for use as reference information.",
  "Translation: The extents of the districts and zones in this data show approximate locations and may differ from the areas actually decided in the city plans.",
  "Translation: This data may not cover all of the city planning information of the municipality concerned.",
  "Translation: This data may not be the latest information. For the date each dataset reflects, refer to the list of publishing municipalities and published data.",
  "Translation: If you need the latest and accurate city planning decision information, contact the department in charge at the relevant local government.",
  "Translation: Neither the Ministry of Land, Infrastructure, Transport and Tourism nor the local governments that provided the source materials accept any responsibility for any act performed using this data (including the use of information made by editing or processing the content) or for any direct or indirect loss or damage arising from the use of this data.",
] as const;

/**
 * What a 乗降客数 figure is (real-data plan PR 4): the snapshot sums each
 * operator's own count, so a transfer passenger is counted once per
 * operator, as the source counts them; and the JR東日本 rows of S12 are the
 * published 乗車人員 doubled (measured against JR East's own pages for five
 * stations, two years). Both sentences come from the snapshot's `notes`.
 */
export const RIDERSHIP_DEFINITION_NOTE = "事業者ごとの駅別乗降客数の合計（乗換客は事業者ごとに数えられます）";
export const RIDERSHIP_JR_NOTE = "JR東日本の値は乗車人員を2倍した値（原典資料による）";

/**
 * S12's own notice on what the operators' figures are (real-data plan PR 4b,
 * Architect decision 2026-11-09): the second bullet of 「その他の情報」 on the
 * dataset's page, verbatim, shown on every transport surface with where it
 * is. The sentence comes from the snapshot's `notes.source_notice`.
 */
export const KSJ_S12_PAGE_URL = "https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-S12-2024.html";
export const RIDERSHIP_SOURCE_NOTICE =
  "各事業者から提供された駅別乗降客数は、各社で独自に算出したものであり、統一的な基準に基づいたものではありませんので、その旨を認識した上でご利用ください。";
export const RIDERSHIP_SOURCE_NOTICE_AT = `国土数値情報 駅別乗降客数データ（国土交通省）「その他の情報」（${KSJ_S12_PAGE_URL}）`;
/** The same, without the address, where the line must stay short (the panels, the line under the tiles). */
export const RIDERSHIP_SOURCE_NOTICE_FROM = "国土数値情報 駅別乗降客数データ（国土交通省）「その他の情報」";
/**
 * The 日間乗降客 tile is too narrow for the sentence: it made the tile tall and
 * stretched the two beside it. The tile carries this marker and the sentence
 * stands once, full width, directly under the three tiles, led by the same
 * mark (Architect decision 2026-11-09).
 */
export const RIDERSHIP_NOTICE_MARKER = "※ 下記の注記参照";
export const RIDERSHIP_NOTICE_LEAD = "※ 日間乗降客：";

/**
 * 東京都交通局's own figures beside S12's in 駅一覧 (follow-up 3, Architect
 * decision A, 2026-11-09), from 東京都交通局 乗降者数情報 on the 公共交通オープン
 * データセンター (https://ckan.odpt.org/dataset/r_passenger_survey-toei, CC BY
 * 4.0, 「コンテンツ等の提供者名: 東京都交通局・公共交通オープンデータ協議会」). The
 * credit takes the form the センター's FAQ prescribes
 * (https://developer.odpt.org/ja/faq-info, read 2026-11-09): 「【提供者名】、
 * 【名称】、クリエイティブ・コモンズ・ライセンス　表示4.0国際（URL）」 — the FAQ sets
 * a full-width space there — and, for a modified use, 「この【…】は、以下の著作物
 * を改変して利用しています。」 and a space before it. The same two sentences are
 * the snapshot's `credit.toei` / `credit.toei_edited`
 * (backend/data/stations.json). The figures are shown, never summed.
 */
export const TOEI_PROVIDER = "東京都交通局・公共交通オープンデータ協議会";
export const TOEI_CONTENT = "東京都交通局 乗降者数情報";
export const TOEI_CREDIT = `${TOEI_PROVIDER}、${TOEI_CONTENT}、クリエイティブ・コモンズ・ライセンス\u3000表示4.0国際（https://creativecommons.org/licenses/by/4.0/deed.ja）`;
export const TOEI_EDITED = `このサービスは、以下の著作物を改変して利用しています。 ${TOEI_CREDIT}`;
export const TOEI_CREDIT_EN =
  "Translation: This service modifies the work below. Bureau of Transportation, Tokyo Metropolitan Government / Association for Open Data of Public Transportation, Passenger survey of Bureau of Transportation, Tokyo Metropolitan Government, Creative Commons Attribution 4.0 International (https://creativecommons.org/licenses/by/4.0/deed.ja).";
/** How 駅一覧 labels the two figures of a 都営 line: the operator's with its 年度, then S12's. */
export const OWN_FIGURE_PUBLISHER = "東京都交通局";
export const OWN_FIGURE_S12 = "国土数値情報";
export const OWN_FIGURE_S12_ELSEWHERE = "他の行に計上";

/**
 * 事業者別 groups the figures by the operator S12 writes them under, and a row
 * may hold another operator's line (its 備考 says which) — so the title says
 * whose rows these are (Architect decision 2026-11-09).
 */
export const RIDERSHIP_OPERATORS_TITLE = "国土数値情報の記載事業者別（他社線を含む行あり）";

/**
 * 乗降客数推移 (real-data plan PR 4b): what the chart sums. A unit is one S12
 * row, or the rows of one station whose figures S12 moves between each other
 * inside one ward; the panel holds the units whose every drawn year is
 * comparable. Values are S12's as published.
 */
export const RIDERSHIP_TREND_UNIT_NOTE =
  "単位＝国土数値情報の事業者・駅ごとの行（同じ区の中で値が行の間を移る駅は1単位）。全年度を同じ基準で比べられる単位だけを合計し、値は国土数値情報の掲載値のまま（補正なし）";

/**
 * What a 地価 figure is (real-data plan PR 5, Architect decision 4): per ward
 * and use, the simple mean of the 地価公示価格 over every point, the simple mean
 * 対前年変動率 over the 継続 points — the definitions 東京都 publishes its
 * 区市町村別 tables with — and 工業地 as a count only. The three sentences come
 * from the snapshot's `notes`.
 */
export const LAND_PRICE_MEAN_NOTE = "平均価格は各用途の全地点の地価公示価格の単純平均";
export const LAND_PRICE_CHANGE_NOTE = "変動率は継続地点（前年と比較できる地点）の対前年変動率の単純平均";
export const LAND_PRICE_USES_NOTE = "住宅地と商業地のみ区別に集計（用途区分 000 住宅地、005 商業地）；工業地は地点数のみ";

/**
 * What a 用途地域 figure is (real-data plan PR 6, Architect decisions 2026-11-03):
 * the shares are of the ward's designated area, clipped to the N03 ward
 * polygon; the designated share is that area over the polygon's; 容積率 /
 * 建蔽率 are area-weighted means with their range; the 時点 is the data list's.
 * The four sentences come from the snapshot's `notes`.
 */
export const ZONING_SHARE_NOTE =
  "各用途地域の面積割合は、区の用途地域指定区域（A55 の用途地域ポリゴンを行政区域データ N03 の区ポリゴンで切り抜いた面積の合計）に対する割合。区ごとに合計 100%";
export const ZONING_DESIGNATED_NOTE =
  "指定区域の割合 = 用途地域ポリゴン ∩ 区ポリゴン（N03-20260101）の面積 ÷ 区ポリゴンの面積。河川・海面など用途地域の指定がない部分が残りで、100% を超えない";
export const ZONING_FAR_NOTE = "容積率・建蔽率は用途地域ごとの面積加重平均（切り抜いた面積で加重）と、ポリゴンに記録された指定値の範囲（最小〜最大）";
export const ZONING_ASOF_NOTE =
  "時点は国土数値情報 公表自治体及び掲載データ一覧（A55_R6_datalist.xlsx）のデータ時点年の列から区ごとに読む。記載のない区は「掲載データ一覧に記載なし」";

/**
 * 災害 (real-data plan PR 7, Architect decisions 2026-11-05).
 *
 * 地震: 東京都「地震に関する地域危険度測定調査（第9回）」. Its dataset page on
 * the 東京都オープンデータAPIカタログ (read 2026-11-04) licenses it CC BY, and
 * 東京都オープンデータ利用規約 (https://portal.data.metro.tokyo.lg.jp/terms/)
 * prescribes the credit — 2(1)ア 「【タイトル】、東京都・【その他の著作権者】、
 * クリエイティブ・コモンズ・ライセンス 表示4.0国際（URL）」 — and, for a modified
 * use (the dashboard counts the 町丁目 per rank), 2(1)イ the sentence that the
 * work is modified. The same two sentences are recorded in the snapshot's
 * `credit.kikendo` / `credit.kikendo_edited` (backend/data/disaster_risks.json).
 */
export const KIKENDO_TITLE = "地震に関する地域危険度測定調査（第9回）地域危険度一覧（令和4年9月公表）";
export const TOKYO_CC_BY = "クリエイティブ・コモンズ・ライセンス 表示4.0国際（https://creativecommons.org/licenses/by/4.0/deed.ja）";
export const KIKENDO_CREDIT = `${KIKENDO_TITLE}、東京都、${TOKYO_CC_BY}`;
export const KIKENDO_EDITED = `このサービスは、以下の著作物を改変して利用しています。${KIKENDO_CREDIT}`;
export const KIKENDO_CREDIT_EN =
  "Translation: Earthquake regional risk survey (9th), list of regional risk (published September 2022), Tokyo Metropolitan Government, Creative Commons Attribution 4.0 International (https://creativecommons.org/licenses/by/4.0/deed.ja). This service modifies the work above.";
/**
 * 国土数値情報 利用規約 1)イ for the 洪水 (A31a), 土砂 (A33) and 津波 (A40)
 * figures: the 加工 form with no editor name (Architect decision 12).
 * Recorded in the snapshot's `credit.edited_a31` … `edited_a40`.
 */
export const KSJ_A31_EDITED = `「国土数値情報（洪水浸水想定区域データ）」（国土交通省）（${KSJ_SITE_URL}）を加工して作成`;
export const KSJ_A33_EDITED = `「国土数値情報（土砂災害警戒区域データ）」（国土交通省）（${KSJ_SITE_URL}）を加工して作成`;
export const KSJ_A40_EDITED = `「国土数値情報（津波浸水想定データ）」（国土交通省）（${KSJ_SITE_URL}）を加工して作成`;
export const KSJ_A31_EDITED_EN =
  "Translation: Created by processing the National Land Numerical Information (flood inundation area data), Ministry of Land, Infrastructure, Transport and Tourism (https://nlftp.mlit.go.jp/ksj/).";
export const KSJ_A33_EDITED_EN =
  "Translation: Created by processing the National Land Numerical Information (sediment disaster warning area data), Ministry of Land, Infrastructure, Transport and Tourism (https://nlftp.mlit.go.jp/ksj/).";
export const KSJ_A40_EDITED_EN =
  "Translation: Created by processing the National Land Numerical Information (tsunami inundation data), Ministry of Land, Infrastructure, Transport and Tourism (https://nlftp.mlit.go.jp/ksj/).";
/**
 * 高潮 (follow-up 3, Architect decision B, 2026-11-09): 東京都港湾局・建設局
 * 「高潮浸水想定区域図」（令和6年12月改定）, in place of 国土数値情報's 2020年度 file.
 * Catalogue record t000015d1700000007 is CC BY 4.0 (read through a mirror — the
 * catalogue is geo-blocked from the build machine) and 東京都オープンデータ利用規約
 * (read directly) prescribes the credit, so it takes the same 2(1)ア / イ form
 * as 地域危険度: the dashboard puts the 10 m cells into depth classes and sums
 * them per ward, which is a modified use. The same sentences are the
 * snapshot's `credit.takashio` / `credit.takashio_edited`, `notes.hightide_classes`
 * and `notes.hightide_as_of` (backend/data/disaster_risks.json).
 */
export const TAKASHIO_TITLE = "高潮浸水想定区域図［想定最大規模］（浸水深）";
export const TAKASHIO_CREDIT = `${TAKASHIO_TITLE}、東京都、${TOKYO_CC_BY}`;
export const TAKASHIO_EDITED = `このサービスは、以下の著作物を改変して利用しています。${TAKASHIO_CREDIT}`;
export const TAKASHIO_CREDIT_EN =
  "Translation: Storm surge inundation area map [maximum assumed scale] (inundation depth), Tokyo Metropolitan Government, Creative Commons Attribution 4.0 International (https://creativecommons.org/licenses/by/4.0/deed.ja). This service modifies the work above.";
/** The 時点 the 高潮 surface shows, and what it says about its depth classes. */
export const TAKASHIO_AS_OF_LEAD = "時点：";
export const TAKASHIO_CLASS_NOTE =
  "浸水深の区分は、これまでと同じ7区分の境界（0.3m・0.5m・1m・3m・5m・10m・20m）を、東京都のデータの浸水深（10mメッシュごと、m単位）に当てはめたものです";
/**
 * The A33 page's 【重要：データ利用時の注意事項】 bullet that applies to every
 * 土砂 figure here, and the A31a page's 留意事項 and 東京都 note, word for word
 * (read 2026-11-04). The snapshot carries the same sentences in `notices`.
 */
export const A33_NOTICE = "本ページで提供する土砂災害警戒区域等の位置は、概略位置を示した参考図であり土砂災害警戒区域等の境界を明示するものではありません。";
export const A31_NOTICES = [
  "洪水浸水想定のシミュレーションの実施にあたっては、支川の氾濫、シミュレーションの前提となる降雨を超える規模の降雨、高潮及び内水による氾濫等を考慮していませんので、この洪水浸水想定区域に指定されていない区域においても浸水が発生する場合や、実際の浸水深がこの洪水浸水想定よりも大きい場合があります。",
  "東京都：独自の施策として、洪水予報河川及び水位周知河川以外の河川からの外水氾濫や内水氾濫での浸水も表示した「浸水予想区域図」を作成・公表しており、区市町村等の自治体はこの「浸水予想区域図」を基にハザードマップを作成しています。そのため、住民の方々が所有しているハザードマップと浸水域が異なる場合があります。",
] as const;
/**
 * ハザードマップポータルサイト 利用規約 (令和6年12月9日) 1)1 出典記載例, for the
 * 洪水 and 急傾斜地 rasters drawn as they are served (no 加工).
 */
export const HAZARD_PORTAL_URL = "https://disaportal.gsi.go.jp/";
export const HAZARD_PORTAL_SOURCE = "出典：ハザードマップポータルサイト";
export const HAZARD_PORTAL_SOURCE_EN = "Translation: Source: Hazard Map Portal Site";

/**
 * 公園等・農用地・森林・原野 (real-data plan PR 8, Architect decision 6).
 *
 * 東京都都市整備局「東京の土地利用 令和３年東京都区部」（表－１）令和３年土地面積
 * （区部・区別）, tochi_r3_01.csv. Its dataset page on the 東京都オープンデータAPI
 * カタログ licenses it CC BY (read 2026-11-09), so the credit takes the same
 * 東京都オープンデータ利用規約 2(1)ア form as 地域危険度, and the 2(1)イ sentence:
 * the dashboard computes a share from four of the table's classes. The same two
 * sentences are the snapshot's `credit.tokyo` / `credit.tokyo_edited`
 * (backend/data/green_land_use.json).
 */
export const TOCHI_TITLE = "東京の土地利用 令和３年東京都区部（表－１）令和３年土地面積（区部・区別）";
export const TOCHI_CREDIT = `${TOCHI_TITLE}、東京都、${TOKYO_CC_BY}`;
export const TOCHI_EDITED = `このサービスは、以下の著作物を改変して利用しています。${TOCHI_CREDIT}`;
export const TOCHI_CREDIT_EN =
  "Translation: Land use in Tokyo, 2021, ward area (Table 1): land area by ward and for the ward area, 2021, Tokyo Metropolitan Government, Creative Commons Attribution 4.0 International (https://creativecommons.org/licenses/by/4.0/deed.ja). This service modifies the work above.";

/** dataofjapan/land README: name the upstream, 地球地図日本. */
export const BOUNDARY_SOURCE = "dataofjapan/land（出典：地球地図日本）";
export const WARD_BOUNDARY_CREDIT = `区境界: ${BOUNDARY_SOURCE}`;

/** 地理院タイル一覧: name 「地理院タイル」 and link the tile list page. */
export const GSI_TILES_NAME = "地理院タイル";
export const GSI_TILE_LIST_URL = "https://maps.gsi.go.jp/development/ichiran.html";
/** 国土地理院コンテンツ利用規約 1)イ: the dark theme recolours the tiles, which is processing. */
export const GSI_PALE_PROCESSED = "地理院タイル（淡色地図）を加工して作成";
