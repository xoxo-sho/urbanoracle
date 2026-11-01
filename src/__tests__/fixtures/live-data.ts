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
  { id: "ts-0", name: "豊洲駅", lat: 35.6549, lng: 139.7963, type: "train", dailyPassengers: 0, lines: ["メトロ 有楽町線"], ward: "江東区" },
  { id: "ts-1", name: "東陽町駅", lat: 35.6697, lng: 139.8172, type: "train", dailyPassengers: null, lines: ["メトロ 東西線"], ward: "江東区" },
];

// ---- 人口推移 (real-data plan PR 3) -------------------------------------------
//
// The six 23-ward totals and their ward rows, derived here from the same
// committed source files the backend guards and the ETL read — the 時系列
// 第6表 excerpt for 2000–2020 and PR 2's raw 0004065881 response for 2025 —
// so no figure in a frontend test is typed by hand.

import { readFileSync } from "node:fs";
import path from "node:path";
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
