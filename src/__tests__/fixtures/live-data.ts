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
