import { readFileSync } from "node:fs";
import path from "node:path";
import type { DemographicsData, FieldSources, TransportStation } from "@/types";
import expected from "../../../backend/tests/fixtures/census_2025/expected.json";

/**
 * Real-shaped answers for the two live endpoints, for tests that need data
 * on screen. They replace the sample sets PR 1 of the real-data plan deleted
 * (sampleDemographics, sampleTransportStations), which the product no longer
 * falls back to.
 *
 * A growth rate of exactly 0 and a station with exactly 0 passengers are in
 * here on purpose: genuine zeros, rendered as 0. The null growth rate and the
 * null ridership are unpublished cells, rendered as データなし.
 */
export const DEMOGRAPHICS_FIXTURE: DemographicsData[] = [
  { region: "江東区", population: 537_924, density: 13_394, growthRate: 0, ageGroups: { young: 13, working: 67, elderly: 20 } },
  { region: "足立区", population: 691_428, density: 12_984, growthRate: -1.2, ageGroups: { young: 11, working: 62, elderly: 27 } },
  { region: "北区", population: 355_777, density: 17_262, growthRate: null, ageGroups: { young: 10, working: 63, elderly: 27 } },
];

/**
 * What the server says about the census fields (real-data plan PR 2): the
 * year and the e-Stat table ids come from the backend's committed fixture,
 * so the two sides of the contract cannot drift apart.
 */
const CENSUS_YEAR = Number(expected.meta.reference_date.slice(0, 4));
export const DEMOGRAPHICS_SOURCES: FieldSources = {
  population: { year: CENSUS_YEAR, table: expected.meta.tables.population, label: "令和7年国勢調査 人口等基本集計（確報）男女別人口" },
  density: {
    year: CENSUS_YEAR,
    table: expected.meta.tables.population,
    label: `令和7年国勢調査 人口等基本集計（確報）人口 ÷ 国土地理院 ${expected.meta.area.edition}`,
  },
  growthRate: { year: CENSUS_YEAR, table: expected.meta.tables.growthRate, label: "令和7年国勢調査 人口等基本集計（確報）5年間の人口増減率（2020年→2025年）" },
  ageGroups: { year: CENSUS_YEAR, table: expected.meta.tables.ageGroups, label: "令和7年国勢調査 人口等基本集計 不詳補完値 年齢（3区分）人口構成比" },
};

export const STATIONS_FIXTURE: TransportStation[] = [
  {
    id: "s12-t00001-13108",
    code: "t00001",
    name: "豊洲駅",
    lat: 35.6549,
    lng: 139.7963,
    type: "train",
    dailyPassengers: 0,
    lines: ["メトロ 8号線有楽町線"],
    ward: "江東区",
    wardCode: "13108",
    operators: [{ name: "東京地下鉄", lines: ["8号線有楽町線"], passengers: 0 }],
  },
  {
    id: "s12-t00002-13108",
    code: "t00002",
    name: "東陽町駅",
    lat: 35.6697,
    lng: 139.8172,
    type: "train",
    dailyPassengers: null,
    lines: ["メトロ 5号線東西線"],
    ward: "江東区",
    wardCode: "13108",
    operators: [{ name: "東京地下鉄", lines: ["5号線東西線"], passengers: null }],
  },
];

// ---- 駅別乗降客数 (real-data plan PR 4) ----------------------------------------
//
// What the server says about the transport payload: the year and the 国土数値情報
// ids come from the committed meta of the source excerpts, so the two sides of
// the contract cannot drift apart.

import ksjMeta from "../../../backend/tests/fixtures/stations/ksj.meta.json";

export const RIDERSHIP_YEAR = Number(ksjMeta.S12.latest_column.replace("乗降客数", ""));
export const TRANSPORT_SOURCES: FieldSources = {
  ridership: {
    year: RIDERSHIP_YEAR,
    table: ksjMeta.S12.id,
    label: `国土数値情報 駅別乗降客数データ ${ksjMeta.S12.edition} ${ksjMeta.S12.latest_column}（1日平均、人/日）`,
  },
  stations: {
    year: RIDERSHIP_YEAR,
    table: ksjMeta.S12.id,
    label: `国土数値情報 駅別乗降客数データ ${ksjMeta.S12.edition} 駅名・運営会社・路線名・位置（線形の中点）`,
  },
  wards: {
    year: Number(ksjMeta.N03.id.slice(4, 8)),
    table: ksjMeta.N03.id,
    label: `国土数値情報 行政区域データ ${ksjMeta.N03.edition} 東京都（区の判定：中点の包含）`,
  },
};

/** The committed snapshot the route serves (backend/data/stations.json), as the builder writes it. */
export interface StationsSnapshot {
  year: number;
  sources: FieldSources;
  credit: { source: string; edited_s12: string; edited_n03: string };
  notes: { definition: string; jr_east: string };
  wards: { code: string; name: string; stations: number; passengers: number }[];
  stations: {
    code: string;
    name: string;
    ward: string;
    wardCode: string;
    lat: number;
    lng: number;
    dailyPassengers: number | null;
    operators: { name: string; lines: string[]; passengers: number | null }[];
    note?: string;
  }[];
}

export function loadStationsSnapshot(): StationsSnapshot {
  const file = path.join(process.cwd(), "backend", "data", "stations.json");
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    throw new Error(`no stations snapshot at ${file} — etl/stations.py build has not been run`);
  }
  return JSON.parse(text) as StationsSnapshot;
}

const OPERATOR_PREFIX: Record<string, string> = { 東日本旅客鉄道: "JR", 東京地下鉄: "メトロ", 東京都: "都営" };

/** The client records the route makes of the snapshot's stations (backend/services/transport.py rows). */
export function stationsSnapshotRows(snapshot: StationsSnapshot): TransportStation[] {
  return snapshot.stations.map((s) => ({
    id: `s12-${s.code}-${s.wardCode}`,
    code: s.code,
    name: s.name.endsWith("駅") ? s.name : `${s.name}駅`,
    lat: s.lat,
    lng: s.lng,
    type: "train" as const,
    dailyPassengers: s.dailyPassengers,
    lines: s.operators.flatMap((o) => o.lines.map((line) => `${OPERATOR_PREFIX[o.name] ?? o.name} ${line}`)),
    ward: s.ward,
    wardCode: s.wardCode,
    operators: s.operators.map((o) => ({ name: o.name, lines: o.lines, passengers: o.passengers })),
    ...(s.note ? { note: s.note } : {}),
  }));
}

// ---- 人口推移 (real-data plan PR 3) -------------------------------------------
//
// The six 23-ward totals and their ward rows, derived here from the same
// committed source files the backend guards and the ETL read — the 時系列
// 第6表 excerpt for 2000–2020 and PR 2's raw 0004065881 response for 2025 —
// so no figure in a frontend test is typed by hand.

import type { PopulationTrend } from "@/types";
import trendMeta from "../../../backend/tests/fixtures/population_trends/estat_000001085987.meta.json";
import populationTable from "../../../backend/tests/fixtures/census_2025/estat_0004065881_wards.json";

export const TREND_REGION = "東京23区";
const SPECIAL_WARDS = "13100";
const WARD_CODES = Array.from({ length: 23 }, (_, i) => `131${String(i + 1).padStart(2, "0")}`);

interface EstatValue {
  "@tab": string;
  "@cat01": string;
  "@area": string;
  $: string;
}
interface EstatClass {
  "@id": string;
  CLASS: { "@code": string; "@name": string }[] | { "@code": string; "@name": string };
}
const statistical = (populationTable as unknown as { GET_STATS_DATA: { STATISTICAL_DATA: { CLASS_INF: { CLASS_OBJ: EstatClass[] }; DATA_INF: { VALUE: EstatValue[] } } } })
  .GET_STATS_DATA.STATISTICAL_DATA;
const areaClass = statistical.CLASS_INF.CLASS_OBJ.find((o) => o["@id"] === "area")!.CLASS;
const WARD_NAME: Record<string, string> = Object.fromEntries(
  (Array.isArray(areaClass) ? areaClass : [areaClass]).map((c) => [c["@code"], c["@name"]])
);

const excerpt = readFileSync(
  path.join(process.cwd(), "backend", "tests", "fixtures", "population_trends", `estat_${trendMeta.stat_infid}_tokyo23.csv`),
  "utf8"
);
const [header, ...lines] = excerpt.trim().split("\n");
const columns = header.split(",");
const excerptRows = lines.map((line) => Object.fromEntries(line.split(",").map((v, i) => [columns[i], v])) as Record<string, string>);

const timeseriesYears = [...new Set(excerptRows.map((r) => Number(r.year)))].sort((a, b) => a - b);
const timeseriesEra = Object.fromEntries(excerptRows.filter((r) => r.code === SPECIAL_WARDS).map((r) => [Number(r.year), r.era]));
const kakuho2025 = statistical.DATA_INF.VALUE.filter((v) => v["@tab"] === "2025_01" && v["@cat01"] === "0");

/** year -> 23-ward total: the 特別区部 rows of the excerpt, then the 2025 確報 sum. */
export const POPULATION_TRENDS_TOTALS: Record<number, number> = {
  ...Object.fromEntries(excerptRows.filter((r) => r.code === SPECIAL_WARDS).map((r) => [Number(r.year), Number(r.total)])),
  2025: kakuho2025.reduce((sum, v) => sum + Number(v.$), 0),
};
export const POPULATION_TRENDS_YEARS: number[] = [...timeseriesYears, 2025];

/** What /population-trends serves: the 東京23区 row per year, then every ward's row. */
export const POPULATION_TRENDS_FIXTURE: PopulationTrend[] = [
  ...POPULATION_TRENDS_YEARS.map((year) => ({ year, population: POPULATION_TRENDS_TOTALS[year], region: TREND_REGION })),
  ...excerptRows
    .filter((r) => WARD_CODES.includes(r.code))
    .map((r) => ({ year: Number(r.year), population: Number(r.total), region: r.name })),
  ...kakuho2025.map((v) => ({ year: 2025, population: Number(v.$), region: WARD_NAME[v["@area"]] })),
];

/** Per point, the year and table the server says the figure came from. */
export const POPULATION_TRENDS_SOURCES: FieldSources = {
  ...Object.fromEntries(
    timeseriesYears.map((year) => [
      String(year),
      { year, table: trendMeta.stat_infid, label: `国勢調査 時系列データ 第6表（${timeseriesEra[year]}）：東京都` },
    ])
  ),
  "2025": { year: 2025, table: expected.meta.tables.population, label: "令和7年国勢調査 人口等基本集計（確報）男女別人口" },
};

// ---- 地価公示 (real-data plan PR 5) ------------------------------------------------
//
// What /api/v1/land-prices serves: the committed snapshot built by
// etl/land_prices.py from the L01-26 excerpt (backend/tests/fixtures/land_prices/),
// one record per ward with the 住宅地 / 商業地 figures and their counts. The
// year and the 国土数値情報 id come from the committed meta, so the two sides
// of the contract cannot drift apart.

import type { LandPriceWard, LandUseFigures } from "@/types";
import l01Meta from "../../../backend/tests/fixtures/land_prices/ksj.meta.json";

export const LAND_PRICE_YEAR = l01Meta.L01.year;
export const LAND_PRICE_TABLE = l01Meta.L01.id;
export const LAND_PRICES_SOURCES: FieldSources = {
  price: {
    year: LAND_PRICE_YEAR,
    table: LAND_PRICE_TABLE,
    label: `国土数値情報 地価公示データ ${l01Meta.L01.edition} 地価公示価格（2026年1月1日時点、円/m²）`,
  },
  change: {
    year: LAND_PRICE_YEAR,
    table: LAND_PRICE_TABLE,
    label: `国土数値情報 地価公示データ ${l01Meta.L01.edition} 対前年変動率（2025年1月1日→2026年1月1日、%）`,
  },
};

/** The committed snapshot the route serves (backend/data/land_prices.json), as the builder writes it. */
export interface LandPricesSnapshot {
  year: number;
  referenceDate: string;
  sources: FieldSources;
  credit: { source: string; edited_l01: string };
  notes: { price: string; change: string; uses: string };
  total: { n: number; residential: LandUseFigures; commercial: LandUseFigures; industrial: { n: number } };
  wards: {
    code: string;
    name: string;
    n: number;
    residential: LandUseFigures;
    commercial: LandUseFigures;
    industrial: { n: number };
  }[];
}

export function loadLandPricesSnapshot(): LandPricesSnapshot {
  const file = path.join(process.cwd(), "backend", "data", "land_prices.json");
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    throw new Error(`no land-prices snapshot at ${file} — etl/land_prices.py build has not been run`);
  }
  return JSON.parse(text) as LandPricesSnapshot;
}

/** The client records the route makes of the snapshot's wards (backend/services/land_prices.py rows). */
export function landPricesSnapshotRows(snapshot: LandPricesSnapshot): LandPriceWard[] {
  return snapshot.wards.map((w) => ({
    region: w.name,
    code: w.code,
    n: w.n,
    residential: { ...w.residential },
    commercial: { ...w.commercial },
    industrial: { n: w.industrial.n },
  }));
}

/**
 * A three-ward answer for component tests, the wards of DEMOGRAPHICS_FIXTURE.
 * The figures are shaped like the snapshot's (a mean, a count, a count of
 * continuing points, a mean change) and are not real figures.
 */
export const LAND_PRICES_FIXTURE: LandPriceWard[] = [
  {
    region: "江東区",
    code: "13108",
    n: 47,
    residential: { n: 26, meanPrice: 661_538, minPrice: 371_000, maxPrice: 1_020_000, nContinuing: 25, meanChange: 11.93 },
    commercial: { n: 17, meanPrice: 1_310_294, minPrice: 600_000, maxPrice: 3_100_000, nContinuing: 17, meanChange: 15.56 },
    industrial: { n: 4 },
  },
  {
    region: "足立区",
    code: "13121",
    n: 108,
    residential: { n: 71, meanPrice: 410_761, minPrice: 227_000, maxPrice: 700_000, nContinuing: 70, meanChange: 6.35 },
    commercial: { n: 32, meanPrice: 847_281, minPrice: 350_000, maxPrice: 3_000_000, nContinuing: 30, meanChange: 8.52 },
    industrial: { n: 5 },
  },
  {
    region: "北区",
    code: "13117",
    n: 54,
    residential: { n: 31, meanPrice: 742_000, minPrice: 460_000, maxPrice: 1_100_000, nContinuing: 29, meanChange: 11.63 },
    commercial: { n: 23, meanPrice: 1_505_826, minPrice: 700_000, maxPrice: 4_000_000, nContinuing: 22, meanChange: 16.17 },
    industrial: { n: 0 },
  },
];

// ---- 用途地域 (real-data plan PR 6) ------------------------------------------------
//
// What /api/v1/zoning serves: the committed snapshot built by etl/zoning.py
// from the A55-24 excerpts (backend/tests/fixtures/zoning/), one composition
// per ward — the share of the ward's designated area by 用途地域 type, the
// designated share of the ward, per type the area-weighted 容積率 / 建蔽率 with
// their range, and the 時点 from the A55 data list — plus the 23区 composition
// as `total`. The year and the 国土数値情報 ids come from the committed meta,
// so the two sides of the contract cannot drift apart.

import type { ZoningComposition, ZoningType } from "@/types";
import a55Meta from "../../../backend/tests/fixtures/zoning/ksj.meta.json";

export const ZONING_YEAR = a55Meta.A55.year;
export const ZONING_TABLE = a55Meta.A55.id;
export const ZONING_SOURCES: FieldSources = {
  zoning: {
    year: ZONING_YEAR,
    table: ZONING_TABLE,
    label: `国土数値情報 都市計画決定情報データ ${a55Meta.A55.edition} 用途地域（東京都、各区の用途地域レイヤ）`,
  },
  wards: {
    year: Number(a55Meta.N03.id.slice(4, 8)),
    table: a55Meta.N03.id,
    label: `国土数値情報 行政区域データ ${a55Meta.N03.edition} 東京都（区の面積と指定区域の切り抜き）`,
  },
  asOf: {
    year: ZONING_YEAR,
    table: a55Meta.datalist.file,
    label: "国土数値情報 都市計画決定情報 公表自治体及び掲載データ一覧（A55_R6_datalist.xlsx）データ時点年",
  },
};

/** One composition as the builder writes it (backend/data/zoning.json). */
export interface ZoningSnapshotComposition {
  code: string;
  name: string;
  wardM2: number;
  designatedM2: number;
  designatedShare: number;
  outsideM2: number;
  polygons: number;
  asOf: {
    date: string | null;
    basis?: string;
    label: string;
    text: string;
    note?: string;
    cells?: Record<string, string | null>;
    from?: string;
    to?: string;
    missing?: string[];
  };
  types: ZoningType[];
}

/** The committed snapshot the route serves, as the builder writes it. */
export interface ZoningSnapshot {
  year: number;
  edition: string;
  sources: FieldSources;
  credit: { source: string; edited_a55: string; edited_n03: string };
  notices: string[];
  notes: Record<string, string>;
  types: { code: number; name: string }[];
  total: ZoningSnapshotComposition;
  wards: ZoningSnapshotComposition[];
}

export function loadZoningSnapshot(): ZoningSnapshot {
  const file = path.join(process.cwd(), "backend", "data", "zoning.json");
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    throw new Error(`no zoning snapshot at ${file} — etl/zoning.py build has not been run`);
  }
  return JSON.parse(text) as ZoningSnapshot;
}

/** The client record the route makes of one composition (backend/services/zoning.py rows / total). */
function zoningRecord(c: ZoningSnapshotComposition): ZoningComposition {
  const { cells: _cells, ...asOf } = c.asOf;
  void _cells;
  return {
    region: c.name,
    code: c.code,
    wardM2: c.wardM2,
    designatedM2: c.designatedM2,
    designatedShare: c.designatedShare,
    outsideM2: c.outsideM2,
    polygons: c.polygons,
    asOf,
    types: c.types,
  };
}

export function zoningSnapshotRows(snapshot: ZoningSnapshot): ZoningComposition[] {
  return snapshot.wards.map(zoningRecord);
}

export function zoningSnapshotTotal(snapshot: ZoningSnapshot): ZoningComposition {
  return zoningRecord(snapshot.total);
}

// A small real-shaped answer for the tests that only need the page to settle
// (dashboard-page, app-credits, the failure states): two wards and a 23区
// composition. Scaffolding, not figures — the figures are guarded in
// zoning.test.tsx against the committed snapshot. 江東区 is the ward the data
// list does not date; its 時点 line is the 記載なし sentence.
const FAR = (mean: number, min: number, max: number) => ({ mean, min, max });
export const ZONING_FIXTURE: ZoningComposition[] = [
  {
    region: "江東区",
    code: "13108",
    wardM2: 44_000_000,
    designatedM2: 36_520_000,
    designatedShare: 83,
    outsideM2: 0,
    polygons: 3,
    asOf: { date: null, basis: "none", label: "国土数値情報の掲載データ一覧に記載なし", text: "時点：国土数値情報の掲載データ一覧に記載なし" },
    types: [
      { code: 5, name: "第１種住居地域", m2: 21_912_000, share: 60, n: 1, far: FAR(200, 200, 200), bcr: FAR(60, 60, 60) },
      { code: 11, name: "準工業地域", m2: 10_956_000, share: 30, n: 1, far: FAR(300, 200, 400), bcr: FAR(60, 60, 60) },
      { code: 13, name: "工業専用地域", m2: 3_652_000, share: 10, n: 1, far: FAR(200, 200, 200), bcr: FAR(60, 60, 60) },
    ],
  },
  {
    region: "足立区",
    code: "13121",
    wardM2: 53_000_000,
    designatedM2: 48_230_000,
    designatedShare: 91,
    outsideM2: 0,
    polygons: 2,
    asOf: { date: "2023-04-28", basis: "asof_cell", label: "2023年4月28日", text: "時点：2023年4月28日" },
    types: [
      { code: 1, name: "第１種低層住居専用地域", m2: 24_115_000, share: 50, n: 1, far: FAR(100, 100, 100), bcr: FAR(50, 50, 50) },
      { code: 10, name: "商業地域", m2: 24_115_000, share: 50, n: 1, far: FAR(500, 400, 600), bcr: FAR(80, 80, 80) },
    ],
  },
];
export const ZONING_TOTAL: ZoningComposition = {
  region: "東京23区",
  code: "13100",
  wardM2: 97_000_000,
  designatedM2: 84_750_000,
  designatedShare: 87.37,
  outsideM2: 0,
  polygons: 5,
  asOf: {
    date: null,
    from: "2023-04-28",
    to: "2023-04-28",
    missing: ["13108"],
    label: "2023年4月28日〜2023年4月28日（1区は掲載データ一覧に記載なし）",
    text: "時点：2023年4月28日〜2023年4月28日（1区は掲載データ一覧に記載なし）",
  },
  types: [
    { code: 1, name: "第１種低層住居専用地域", m2: 24_115_000, share: 28.4543, n: 1, far: FAR(100, 100, 100), bcr: FAR(50, 50, 50) },
    { code: 5, name: "第１種住居地域", m2: 21_912_000, share: 25.8549, n: 1, far: FAR(200, 200, 200), bcr: FAR(60, 60, 60) },
    { code: 10, name: "商業地域", m2: 24_115_000, share: 28.4543, n: 1, far: FAR(500, 400, 600), bcr: FAR(80, 80, 80) },
    { code: 11, name: "準工業地域", m2: 10_956_000, share: 12.9274, n: 1, far: FAR(300, 200, 400), bcr: FAR(60, 60, 60) },
    { code: 13, name: "工業専用地域", m2: 3_652_000, share: 4.3091, n: 1, far: FAR(200, 200, 200), bcr: FAR(60, 60, 60) },
  ],
};

// ---- 災害 (real-data plan PR 7) -------------------------------------------------
//
// What /api/v1/disaster-risks serves: the committed snapshot built by
// etl/disaster.py from the excerpts under backend/tests/fixtures/disaster/ —
// per ward the 東京都 地域危険度 第9回 rank counts, the A31a-25 / A49-20 depth
// class shares, the A33-25 zone counts and the A40 対象外 statement — and the
// 23区 record as `total`. Read from the file, never re-typed.

/** One ward (or the 23区) as the builder writes it (backend/data/disaster_risks.json). */
export interface DisasterSnapshotRecord {
  code: string;
  name: string;
  earthquake: { n: number; ranks: { total: number[]; building: number[]; fire: number[] }; rank5: number; rank5Share: number; relative: string };
  flood: { wardM2: number; m2: number; share: number; deepM2: number; deepShare: number; classes: { code: number; label: string; m2: number; share: number }[] };
  landslide: { phenomena: { code: number; name: string; warning: number; special: number }[]; warning: number; special: number };
  tsunami: { status: "notCovered"; text: string };
  hightide: { wardM2: number; m2: number; share: number; classes: { code: number; label: string; m2: number; share: number }[] };
}

export interface DisasterSnapshot {
  region: string;
  sources: FieldSources;
  hazards: { tsunami: { text: string } } & Record<string, unknown>;
  credit: Record<string, string>;
  notices: { A31a: string[]; A33: string[] };
  notes: Record<string, string>;
  total: DisasterSnapshotRecord;
  wards: DisasterSnapshotRecord[];
}

export function loadDisasterSnapshot(): DisasterSnapshot {
  const file = path.join(process.cwd(), "backend", "data", "disaster_risks.json");
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    throw new Error(`no 災害 snapshot at ${file} — etl/disaster.py build has not been run`);
  }
  return JSON.parse(text) as DisasterSnapshot;
}

/** The client record the route makes of one ward (backend/services/disaster_risks.py rows / total): `name` becomes `region`. */
export type DisasterRecord = Omit<DisasterSnapshotRecord, "name"> & { region: string };

function disasterRecord(r: DisasterSnapshotRecord): DisasterRecord {
  const { name, ...rest } = r;
  return { ...rest, region: name };
}

export function disasterSnapshotRows(snapshot: DisasterSnapshot): DisasterRecord[] {
  return snapshot.wards.map(disasterRecord);
}

export function disasterSnapshotTotal(snapshot: DisasterSnapshot): DisasterRecord {
  return disasterRecord(snapshot.total);
}

/** The LP hero's committed rows (src/data/hero-spread.json, built by etl/disaster.py hero). */
export interface HeroSpreadFile {
  upside: { label: string; table: string; year: number; use: string; definition: string };
  earthquake: { label: string; short: string; definition: string; relative: string };
  flood: { label: string; table: string; definition: string };
  rows: { code: string; region: string; change: number; nContinuing: number; rank5: number; chochomoku: number; floodDeepShare: number }[];
}

export function loadHeroSpread(): HeroSpreadFile {
  const file = path.join(process.cwd(), "src", "data", "hero-spread.json");
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    throw new Error(`no hero file at ${file} — etl/disaster.py hero has not been run`);
  }
  return JSON.parse(text) as HeroSpreadFile;
}

// ---- 23区の中での位置 (real-data plan PR 8) ----------------------------------------
//
// The comparison table reads every endpoint. For the census it needs all 23
// wards, so the /demographics answer is rebuilt here from PR 2's committed
// expected values (backend/tests/fixtures/census_2025/expected.json) the way
// backend/services/demographics.py transform_census shapes it — population,
// density = round(population ÷ 面積調 area), the area itself (areaKm2, PR 8),
// the growth rate and the age shares. Nothing is typed by hand.

type CensusExpected = {
  name: string;
  population: number;
  population_2020: number;
  area_km2: number;
  growth_rate: number;
  age_share: { young: number; working: number; elderly: number };
};

export const CENSUS_EXPECTED: Record<string, CensusExpected> = expected.wards as Record<string, CensusExpected>;

export const CENSUS_ROWS: (DemographicsData & { areaKm2: number })[] = Object.values(CENSUS_EXPECTED).map((w) => ({
  region: w.name,
  population: w.population,
  density: Math.round(w.population / w.area_km2),
  areaKm2: w.area_km2,
  growthRate: w.growth_rate,
  ageGroups: {
    young: Math.max(0, Math.min(100, Math.round(w.age_share.young))),
    working: Math.max(0, Math.min(100, Math.round(w.age_share.working))),
    elderly: Math.max(0, Math.min(100, Math.round(w.age_share.elderly))),
  },
}));

/** What /api/v1/green-land-use serves (backend/data/green_land_use.json, built by etl/green.py). */
export interface GreenSnapshotRecord {
  code: string;
  name: string;
  totalHa: number;
  greenHa: number;
  share: number;
  classes: { key: string; name: string; ha: number }[];
}

export interface GreenSnapshot {
  region: string;
  year: number;
  label: string;
  sources: FieldSources;
  credit: { tokyo: string; tokyo_edited: string };
  total: GreenSnapshotRecord;
  wards: GreenSnapshotRecord[];
}

export function loadGreenSnapshot(): GreenSnapshot {
  const file = path.join(process.cwd(), "backend", "data", "green_land_use.json");
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    throw new Error(`no green snapshot at ${file} — etl/green.py build has not been run`);
  }
  return JSON.parse(text) as GreenSnapshot;
}

export type GreenRecord = Omit<GreenSnapshotRecord, "name"> & { region: string };
const greenRecord = ({ name, ...rest }: GreenSnapshotRecord): GreenRecord => ({ ...rest, region: name });
export const greenSnapshotRows = (s: GreenSnapshot): GreenRecord[] => s.wards.map(greenRecord);
export const greenSnapshotTotal = (s: GreenSnapshot): GreenRecord => greenRecord(s.total);

/** The /land-prices 23区 figures over every point (the snapshot's `total`, PR 8's additive envelope key). */
export function landPricesSnapshotTotal(snapshot: LandPricesSnapshot) {
  const t = (snapshot as unknown as { region: string; total: { n: number; residential: unknown; commercial: unknown; industrial: { n: number } } });
  return { region: t.region, n: t.total.n, residential: t.total.residential, commercial: t.total.commercial, industrial: { n: t.total.industrial.n } };
}

/** The /api/v1/green-land-use answer, from the committed snapshot: for the page harnesses that answer every route. */
export function greenPayload() {
  const s = loadGreenSnapshot();
  return { status: "ok", data: greenSnapshotRows(s), isLive: true, sources: s.sources, total: greenSnapshotTotal(s) };
}
