import type { Lang } from "@/i18n/lang";
import {
  BUNDLED_UNVERIFIED_NOTE,
  CHOROPLETH_NOTE,
  FETCHED_NOT_SHOWN,
  SAMPLE_NOTICE,
  SOURCES,
} from "@/lib/sources";

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
 *   公共交通オープンデータセンター  Public Transportation Open Data Center  (odpt.org/en)
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

  spreadUp: "上振れ 地価前年比",
  sampleTag: "SAMPLE",
  spreadWard: "区",
  spreadDown: "下振れ 想定災害規模",
  spreadLevel: "Lv.",
  spreadSafety: "安全度",
  spreadUnits: "単位: 前年比 % ・想定災害規模 Lv.1–5",
  sampleNotice: SAMPLE_NOTICE,
  none: "—",

  capabilitiesTitle: "二つの軸",
  upLabel: "上振れ",
  upTitle: "資産価値が伸びる根拠",
  upBody:
    "国勢調査の人口と年齢構成、5年間の人口増減率、駅別の乗降客数。エリアの伸びを支える指標を、区単位で並べて比較します。地価の前年比は現在、サンプルデータ（暫定）で表示しています。",
  downLabel: "下振れ",
  downTitle: "価値を毀損する要因",
  downBody:
    "浸水・津波・土砂災害の想定区域を、ハザードマップポータルサイトのタイルで地図に重ねて確認します。区ごとの災害リスク指標は現在、サンプルデータ（暫定）です。",

  provTitle: "データ出典",
  provIntro: "現在のコードパスで実際に取得しているデータと、暫定のサンプル値を分けて示します。",
  thSource: "出典",
  thContent: "内容",
  thYear: "年次",
  groupLive: "実データ",
  srcReinfolib: SOURCES.reinfolib.label,
  srcEstat: SOURCES.estat.label,
  srcOdpt: SOURCES.odpt.label,
  srcHazard: SOURCES.hazard.label,
  srcBoundaries: "dataofjapan/land",
  srcTiles: "OpenStreetMap contributors ／ CARTO",
  srcSample: SOURCES.sample.label,
  liveReinfolib: `取引価格（対象 8 区・各 5 件まで）— ${FETCHED_NOT_SHOWN}`,
  liveReinfolibYear: "2024年",
  liveEstat: "人口・年齢構成、5年間の人口増減率",
  liveEstatYear: "2020年国勢調査・2025年速報",
  liveOdpt: "駅別乗降客数（交通タブ・地図の駅バブル）",
  liveHazard: "浸水・津波・土砂災害の想定区域（地図の重ね表示）",
  liveBoundaries: "行政区界（区境界ポリゴン）",
  liveTiles: "地図タイル",
  sampleHero: "LP ヒーロー（地価前年比 × 想定災害規模）",
  sampleLandPrice: "区別平均地価・密度 vs 地価・区別テーブルの地価列",
  samplePopulation: "人口推移",
  sampleDisaster: "災害種別・リスク一覧・高リスク指標",
  sampleZoning: "用途地域（面積構成・容積率・建蔽率）",
  sampleRidership: "乗降客数推移",
  sampleRadar: "区別総合比較（レーダー）",
  sampleRadarScale: "0–100",
  sampleChoropleth: `地図の塗り分け: ${CHOROPLETH_NOTE}`,
  stationNoteLabel: "駅の位置・路線: ",
  stationNote: BUNDLED_UNVERIFIED_NOTE,

  footer: "UrbanOracle — DXA Labs ／ OpenStreetMap contributors ／ CARTO",
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

  spreadUp: "Upside: year-on-year land price",
  sampleTag: "SAMPLE",
  spreadWard: "Ward",
  spreadDown: "Downside: projected disaster scale",
  spreadLevel: "Lv.",
  spreadSafety: "Safety",
  spreadUnits: "Units: year-on-year % / projected disaster scale Lv.1–5",
  sampleNotice: "Sample data (provisional) — not real data",
  none: "—",

  capabilitiesTitle: "Two axes",
  upLabel: "Upside",
  upTitle: "Grounds for rising asset value",
  upBody:
    "Population and age composition from the Population Census, the 5-year population change rate, and ridership by station. These indicators behind an area's growth are compared side by side, ward by ward. Year-on-year land price change is currently shown with sample data (provisional).",
  downLabel: "Downside",
  downTitle: "Factors that erode value",
  downBody:
    "Check the assumed flood, tsunami and landslide hazard areas overlaid on the map, using tiles from the Hazard Map Portal Site. The per-ward disaster risk indicators are currently sample data (provisional).",

  provTitle: "Data sources",
  provIntro: "Data the current code path actually fetches is shown separately from provisional sample values.",
  thSource: "Source",
  thContent: "Content",
  thYear: "Year",
  groupLive: "Real data",
  srcReinfolib: "Real Estate Information Library (Ministry of Land, Infrastructure, Transport and Tourism)",
  srcEstat: "e-Stat Population Census (Statistics Bureau, Ministry of Internal Affairs and Communications)",
  srcOdpt: "Public Transportation Open Data Center (ODPT)",
  srcHazard: "Hazard Map Portal Site (Ministry of Land, Infrastructure, Transport and Tourism)",
  srcBoundaries: "dataofjapan/land",
  srcTiles: "OpenStreetMap contributors / CARTO",
  srcSample: "Sample data (provisional)",
  liveReinfolib: "Transaction prices (8 target wards, up to 5 each) — fetched, not shown at present",
  liveReinfolibYear: "2024",
  liveEstat: "Population and age composition, 5-year population change rate",
  liveEstatYear: "2020 Population Census, 2025 preliminary count",
  liveOdpt: "Ridership by station (Transport tab, station bubbles on the map)",
  liveHazard: "Assumed flood, tsunami and landslide hazard areas (map overlay)",
  liveBoundaries: "Administrative boundaries (ward boundary polygons)",
  liveTiles: "Map tiles",
  sampleHero: "LP hero (year-on-year land price × projected disaster scale)",
  sampleLandPrice: "Average land price by ward, density vs land price, land price column of the ward table",
  samplePopulation: "Population trend",
  sampleDisaster: "Disaster types, risk list, high-risk indicator",
  sampleZoning: "Zoning (area mix, floor area ratio, building coverage ratio)",
  sampleRidership: "Ridership trend",
  sampleRadar: "Overall comparison by ward (radar)",
  sampleRadarScale: "0–100",
  sampleChoropleth: "Map shading: fixed reference values — not real data",
  stationNoteLabel: "Station locations and lines: ",
  stationNote: "bundled data (source unverified)",

  footer: "UrbanOracle — DXA Labs / OpenStreetMap contributors / CARTO",
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
