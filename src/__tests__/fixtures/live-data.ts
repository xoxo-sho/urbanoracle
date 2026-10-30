import type { DemographicsData, TransportStation } from "@/types";

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

export const STATIONS_FIXTURE: TransportStation[] = [
  { id: "ts-0", name: "豊洲駅", lat: 35.6549, lng: 139.7963, type: "train", dailyPassengers: 0, lines: ["メトロ 有楽町線"], ward: "江東区" },
  { id: "ts-1", name: "東陽町駅", lat: 35.6697, lng: 139.8172, type: "train", dailyPassengers: null, lines: ["メトロ 東西線"], ward: "江東区" },
];
