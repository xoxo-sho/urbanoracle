import type { Lang } from "@/i18n/lang";
import { SAMPLE_NOTICE, SOURCES } from "@/lib/sources";
import { BOUNDARY_SOURCE } from "@/lib/credits";

/**
 * Every string the landing page renders, in Japanese and English.
 *
 * `ja` is the source of truth and reads exactly as the page did before the
 * toggle existed (the shared provenance labels are referenced from
 * lib/sources.ts rather than copied, so the LP and the dashboard cannot drift).
 * `en` is declared with `satisfies`, and LP_KEYS_MATCH fails `tsc` / `next
 * build` if either side has a key the other lacks.
 *
 * English rules: translated from the Japanese only — no claim, number, source
 * or qualifier added or dropped; the digits of every key are identical in both
 * languages (src/__tests__/i18n/lp-dictionary.test.ts); no full-width or CJK
 * punctuation. Official English names are used where the body itself publishes
 * one; otherwise the name is translated literally:
 *
 *   国土交通省                Ministry of Land, Infrastructure, Transport and Tourism  (mlit.go.jp/en)
 *   総務省統計局              Statistics Bureau, Ministry of Internal Affairs and Communications  (stat.go.jp/english)
 *   国勢調査                  Population Census  (stat.go.jp/english)
 *   e-Stat                    e-Stat  (e-stat.go.jp/en: "e-Stat Portal Site of Official Statistics of Japan")
 *   国土数値情報                National Land Numerical Information  (nlftp.mlit.go.jp/ksj)
 *   ハザードマップポータルサイト    Hazard Map Portal Site  (mlit.go.jp/river/bousai/bousai-portal/en/)
 *   不動産情報ライブラリ        Real Estate Information Library  (literal — the site publishes no English name)
 *
 * Out of scope here, and still Japanese: og:*, twitter:*, og:locale, the
 * keywords meta and the OG image (static export: they are baked into the HTML
 * and cannot follow a choice made in the browser).
 */

const ja = {
  metaTitle: "UrbanOracle — 東京23区の上振れと下振れ",
  metaDescription: "地価・人口・交通の上振れと、災害リスクの下振れを同一の意思決定面で読み解く都市データ計器。",

  brand: "UrbanOracle",
  langGroup: "言語 / Language",
  langJa: "JA",
  langEn: "EN",
  headerSignIn: "サインイン",

  heroEyebrow: "TOKYO 23 WARDS — LAND VALUE × RISK",
  heroTitle1: "都市の資産価値を、",
  heroTitle2: "上振れと下振れの両面から読み解く。",
  heroBody:
    "伸びしろだけを見ても、リスクだけを見ても、投資判断はできません。 UrbanOracle は東京23区の地価・人口・交通と災害リスクを同一の面に置き、 どちらか一方に偏らない比較を可能にします。",
  heroCta: "サインイン",
  heroAccountNote: "一つのアカウントで DXA Labs の全プロダクトにアクセスできます。",

  spreadUp: "上振れ 住宅地 平均変動率",
  spreadWard: "区",
  spreadDown: "下振れ 地震・洪水",
  spreadQuake: "地震",
  spreadFlood: "洪水",
  spreadFloodDeep: "浸水深3m以上",
  spreadUnits:
    "上振れ: 2026年地価公示（2025年1月1日→2026年1月1日）住宅地の継続地点（前年と比較できる地点）の対前年変動率の単純平均、上位6区 ／ 地震: 東京都 地域危険度 第9回（2022年）総合危険度ランク5の町丁目の数（区の全町丁目中）。ランクは都内5,192町丁目の中での相対評価 ／ 洪水: 国土数値情報 洪水浸水想定区域データ A31a-25（想定最大規模）、区の面積に占める浸水深3m以上の区域の割合",
  sampleNotice: SAMPLE_NOTICE,
  none: "—",

  capabilitiesTitle: "二つの軸",
  upLabel: "上振れ",
  upTitle: "資産価値が伸びる根拠",
  upBody:
    "国勢調査の人口と年齢構成、5年間の人口増減率、駅別の乗降客数、地価公示の区別平均価格と変動率。エリアの伸びを支える指標を、区単位で並べて比較します。",
  downLabel: "下振れ",
  downTitle: "価値を毀損する要因",
  downBody:
    "地震は東京都の地域危険度（町丁目ごとのランク1〜5、都内の町丁目の中での相対評価）、洪水・高潮は想定最大規模の浸水深の区分ごとの面積割合、土砂災害は警戒区域・特別警戒区域の数を、区ごとに示します。23区には津波浸水想定が設定されていないことも、その根拠とともに示します。洪水と急傾斜地の崩壊の想定区域は、ハザードマップポータルサイトのタイルで地図に重ねます。",

  provTitle: "データ出典",
  provIntro: "現在のコードパスで実際に取得しているデータと、暫定のサンプル値を分けて示します。",
  thSource: "出典",
  thContent: "内容",
  thYear: "年次",
  groupLive: "実データ",
  srcEstat: SOURCES.estat.label,
  srcKsj: SOURCES.ksj.label,
  srcHazard: SOURCES.hazard.label,
  srcKikendo: SOURCES.tokyoKikendo.label,
  srcHero: "国土数値情報（国土交通省）・東京都",
  srcBoundaries: BOUNDARY_SOURCE,
  srcTiles: "地理院タイル（国土地理院）",
  srcSample: SOURCES.sample.label,
  liveEstat: "人口・密度・年齢構成、5年間の人口増減率",
  liveEstatYear: "2025年国勢調査（人口等基本集計・確報）",
  livePopTrend: "人口推移（東京23区、2000–2025年）",
  livePopTrendYear: "国勢調査 時系列データ（2000–2020年）・2025年国勢調査（確報）",
  srcMencho: "全国都道府県市区町村別面積調（国土地理院）",
  liveMencho: "区の面積（人口密度の分母）",
  liveMenchoYear: "2025年10月1日時点",
  liveStations: "駅別乗降客数・駅の位置（交通タブ・乗降客指標・地図の駅バブル）",
  liveStationsYear: "2024年度 駅別乗降客数データ（S12-25）・行政区域データ（N03-20260101）",
  liveLandPrice: "地価公示の区別平均価格・変動率（住宅地／商業地：地価タブ・区別テーブルの地価列・地図の塗り分け）",
  liveLandPriceYear: "2026年地価公示（2026年1月1日時点）・地価公示データ（L01-26）",
  liveZoning: "用途地域の面積構成・容積率・建蔽率（用途地域タブ・災害タブ）",
  liveZoningYear: "2024年度（令和6年度）版 都市計画決定情報データ（A55-24）・行政区域データ（N03-20260101）",
  liveHazard: "洪水（想定最大規模）・土砂災害警戒区域（急傾斜地の崩壊）の想定区域（地図の重ね表示）",
  liveQuake: "地震: 町丁目ごとの総合・建物倒壊・火災危険度ランクの区別集計（災害タブ・ランク5の町丁目指標・地図の塗り分け）",
  liveQuakeYear: "地震に関する地域危険度測定調査（第9回、2022年9月公表）",
  liveDisasterKsj: "洪水・高潮の浸水深区分別の面積割合、土砂災害警戒区域の数、津波浸水想定の有無（災害タブ）",
  liveDisasterKsjYear: "洪水浸水想定区域（A31a-25）・土砂災害警戒区域（A33-25）・津波浸水想定（A40-23）・高潮浸水想定区域（A49-20）・行政区域データ（N03-20260101）",
  srcTochi: "東京都都市整備局「土地利用現況調査」",
  liveGreen: "公園等・農用地・森林・原野の面積割合（23区の中での位置）",
  liveGreenYear: "2021年 土地利用現況調査（表－1 土地面積・区部区別）",
  srcComparison: "上記の各出典",
  liveComparison: "23区の中での位置（7指標の区の値・23区全体の値・値の大きい順の順位）",
  liveHero: "LP ヒーロー（住宅地 平均変動率 × 地震・洪水）",
  liveHeroYear: "2026年地価公示（L01-26）・地域危険度 第9回・洪水浸水想定区域（A31a-25）",
  liveBoundaries: "行政区界（区境界ポリゴン）",
  liveTiles: "地図タイル（淡色地図）",
  sampleRidership: "乗降客数推移",

  provRequiredTitle: "データ提供元が求める表示",

  footer: "UrbanOracle — DXA Labs ／ 地図: 地理院タイル",
} satisfies Record<string, string>;

const en = {
  metaTitle: "UrbanOracle — Upside and downside across Tokyo's 23 wards",
  metaDescription:
    "An urban data instrument for reading the upside of land prices, population and transport and the downside of disaster risk on the same decision surface.",

  brand: "UrbanOracle",
  langGroup: "Language",
  langJa: "JA",
  langEn: "EN",
  headerSignIn: "Sign in",

  heroEyebrow: "TOKYO 23 WARDS — LAND VALUE × RISK",
  heroTitle1: "Reading a city's asset value",
  heroTitle2: "from both the upside and the downside.",
  heroBody:
    "Looking only at growth potential, or only at risk, is not enough to make an investment decision. UrbanOracle puts land prices, population, transport and disaster risk for Tokyo's 23 wards on the same surface, making possible a comparison that leans to neither side.",
  heroCta: "Sign in",
  heroAccountNote: "One account gives access to every DXA Labs product.",

  spreadUp: "Upside: residential average change",
  spreadWard: "Ward",
  spreadDown: "Downside: earthquake, flood",
  spreadQuake: "Earthquake",
  spreadFlood: "Flood",
  spreadFloodDeep: "depth 3 m or more",
  spreadUnits:
    "Upside: 2026 published land prices (2025/1/1 to 2026/1/1), simple mean of the year-on-year change of the residential points that continue from the previous year, top 6 wards / Earthquake: Tokyo Metropolitan Government regional earthquake risk survey, 9th (2022), number of chome at overall risk rank 5 (of all the chome in the ward); the ranks are a relative evaluation among the 5,192 chome in Tokyo / Flood: National Land Numerical Information flood inundation area data A31a-25 (maximum assumed scale), share of the ward's area with an inundation depth of 3 m or more",
  sampleNotice: "Sample data (provisional) — not real data",
  none: "—",

  capabilitiesTitle: "Two axes",
  upLabel: "Upside",
  upTitle: "Grounds for rising asset value",
  upBody:
    "Population and age composition from the Population Census, the 5-year population change rate, ridership by station, and the published land price (chika koji) average and year-on-year change by ward. These indicators behind an area's growth are compared side by side, ward by ward.",
  downLabel: "Downside",
  downTitle: "Factors that erode value",
  downBody:
    "By ward: earthquake risk from the Tokyo Metropolitan Government's regional risk survey (ranks 1–5 per chome, a relative evaluation among the chome in Tokyo), the share of the area in each inundation depth class for flood and storm surge (maximum assumed scale), and the number of sediment disaster warning and special warning areas. That no tsunami inundation projection is set for the 23 wards is shown with its basis. The assumed flood and steep-slope failure areas are overlaid on the map using tiles from the Hazard Map Portal Site.",

  provTitle: "Data sources",
  provIntro: "Data the current code path actually fetches is shown separately from provisional sample values.",
  thSource: "Source",
  thContent: "Content",
  thYear: "Year",
  groupLive: "Real data",
  srcEstat: "e-Stat Population Census (Statistics Bureau, Ministry of Internal Affairs and Communications)",
  srcKsj: "National Land Numerical Information (Ministry of Land, Infrastructure, Transport and Tourism)",
  srcHazard: "Hazard Map Portal Site (Ministry of Land, Infrastructure, Transport and Tourism)",
  srcKikendo: "Tokyo Metropolitan Government regional earthquake risk survey (Bureau of Urban Development)",
  srcHero: "National Land Numerical Information (Ministry of Land, Infrastructure, Transport and Tourism), Tokyo Metropolitan Government",
  srcBoundaries: "dataofjapan/land (source: Global Map Japan)",
  srcTiles: "GSI Tiles (Geospatial Information Authority of Japan)",
  srcSample: "Sample data (provisional)",
  liveEstat: "Population, density and age composition, 5-year population change rate",
  liveEstatYear: "2025 Population Census (basic complete tabulation, final)",
  livePopTrend: "Population trend (23 wards, 2000–2025)",
  livePopTrendYear: "Population Census time series (2000–2020), 2025 Population Census (final)",
  srcMencho: "Area survey of prefectures and municipalities (Geospatial Information Authority of Japan)",
  liveMencho: "Ward area (denominator of population density)",
  liveMenchoYear: "As of 2025/10/1",
  liveStations: "Ridership and station locations by station (Transport tab, ridership metric, station bubbles on the map)",
  liveStationsYear: "FY2024 ridership by station (S12-25), administrative area data (N03-20260101)",
  liveLandPrice: "Published land price (chika koji) average and year-on-year change by ward (residential / commercial: Land price tab, land price column of the ward table, map shading)",
  liveLandPriceYear: "2026 published land prices (as of 2026/1/1), published land price data (L01-26)",
  liveZoning: "Zoning area mix, floor area ratio and building coverage ratio (Zoning tab, Disaster tab)",
  liveZoningYear: "FY2024 (Reiwa 6) city planning decision data (A55-24), administrative area data (N03-20260101)",
  liveHazard: "Assumed areas of flood (maximum assumed scale) and sediment disaster warning areas (steep-slope failure) (map overlay)",
  liveQuake: "Earthquake: per-ward tally of the overall, building collapse and fire risk ranks of each chome (Disaster tab, rank 5 metric, map shading)",
  liveQuakeYear: "Regional earthquake risk survey (9th, published 2022/9)",
  liveDisasterKsj: "Share of area by inundation depth class for flood and storm surge, number of sediment disaster warning areas, whether a tsunami inundation projection is set (Disaster tab)",
  liveDisasterKsjYear: "Flood inundation areas (A31a-25), sediment disaster warning areas (A33-25), tsunami inundation (A40-23), storm surge inundation areas (A49-20), administrative area data (N03-20260101)",
  srcTochi: "Tokyo Metropolitan Government land use survey (Bureau of Urban Development)",
  liveGreen: "Share of area that is parks etc., farmland, forest or wild land (Position among the 23 wards)",
  liveGreenYear: "2021 land use survey (Table 1, land area by ward)",
  srcComparison: "Each source above",
  liveComparison: "Position among the 23 wards (for 7 measures: the ward value, the 23-ward figure and the rank, largest first)",
  liveHero: "LP hero (residential average change × earthquake, flood)",
  liveHeroYear: "2026 published land prices (L01-26), regional risk survey 9th, flood inundation areas (A31a-25)",
  liveBoundaries: "Administrative boundaries (ward boundary polygons)",
  liveTiles: "Map tiles (pale map)",
  sampleRidership: "Ridership trend",

  provRequiredTitle: "Notices the data providers require (the prescribed Japanese text, each followed by a translation)",

  footer: "UrbanOracle — DXA Labs / Map: GSI Tiles",
} satisfies Record<keyof typeof ja, string>;

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** Compile-time: ja and en carry exactly the same keys. */
export const LP_KEYS_MATCH: Equal<keyof typeof ja, keyof typeof en> = true;

export type LpKey = keyof typeof ja;
export type Copy = Record<LpKey, string>;

export const LP_COPY: Record<Lang, Copy> = { ja, en };

/**
 * The 23 wards by code (13101–13123, the order of
 * backend/services/demographics.py:TOKYO_WARDS). `ja` is the name without
 * 「区」, as the hero spread prints it; `en` is the romanized name.
 */
export type WardCode =
  | "13101" | "13102" | "13103" | "13104" | "13105" | "13106" | "13107" | "13108"
  | "13109" | "13110" | "13111" | "13112" | "13113" | "13114" | "13115" | "13116"
  | "13117" | "13118" | "13119" | "13120" | "13121" | "13122" | "13123";

export const WARD_NAMES: Record<WardCode, Record<Lang, string>> = {
  "13101": { ja: "千代田", en: "Chiyoda" },
  "13102": { ja: "中央", en: "Chuo" },
  "13103": { ja: "港", en: "Minato" },
  "13104": { ja: "新宿", en: "Shinjuku" },
  "13105": { ja: "文京", en: "Bunkyo" },
  "13106": { ja: "台東", en: "Taito" },
  "13107": { ja: "墨田", en: "Sumida" },
  "13108": { ja: "江東", en: "Koto" },
  "13109": { ja: "品川", en: "Shinagawa" },
  "13110": { ja: "目黒", en: "Meguro" },
  "13111": { ja: "大田", en: "Ota" },
  "13112": { ja: "世田谷", en: "Setagaya" },
  "13113": { ja: "渋谷", en: "Shibuya" },
  "13114": { ja: "中野", en: "Nakano" },
  "13115": { ja: "杉並", en: "Suginami" },
  "13116": { ja: "豊島", en: "Toshima" },
  "13117": { ja: "北", en: "Kita" },
  "13118": { ja: "荒川", en: "Arakawa" },
  "13119": { ja: "板橋", en: "Itabashi" },
  "13120": { ja: "練馬", en: "Nerima" },
  "13121": { ja: "足立", en: "Adachi" },
  "13122": { ja: "葛飾", en: "Katsushika" },
  "13123": { ja: "江戸川", en: "Edogawa" },
};

/** The code of a ward written as the sample data writes it (e.g. 「千代田区」). */
export function wardCode(region: string): WardCode | undefined {
  return (Object.keys(WARD_NAMES) as WardCode[]).find((code) => `${WARD_NAMES[code].ja}区` === region);
}

/** A ward's display name in `lang`, looked up by code — never transliterated. */
export function wardName(region: string, lang: Lang): string {
  const code = wardCode(region);
  return code ? WARD_NAMES[code][lang] : region.replace("区", "");
}
