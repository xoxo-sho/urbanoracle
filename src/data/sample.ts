import type { DataLayer, TransportTrend } from "@/types";

export const dataLayers: DataLayer[] = [
  { id: "land-price", label: "地価", description: "公示地価・基準地価", color: "var(--up-text)", enabled: true },
  { id: "demographics", label: "人口統計", description: "人口・世帯数・年齢構成", color: "var(--ink-3)", enabled: false },
  { id: "disaster-risk", label: "災害リスク", description: "洪水・地震・土砂災害・津波", color: "var(--down-text)", enabled: false },
  { id: "transportation", label: "交通", description: "鉄道・バス路線・乗降客数", color: "var(--ink-4)", enabled: false },
  { id: "zoning", label: "用途地域", description: "用途地域・容積率・建蔽率", color: "var(--ink-5)", enabled: false },
];

// The LP hero's set (src/components/landing/HeroSpread.tsx), its only reader
// since real-data plan PR 5: the dashboard's 地価 surfaces read the 地価公示
// snapshot (/api/v1/land-prices). PR 7 switches the hero together with its
// downside and deletes this.

// 5主要駅の年次推移（COVID影響あり） — the last sample set: 乗降客数推移 on the 交通
// tab reads it and says SAMPLE. The radar's ward profiles left with real-data
// plan PR 8, when the radar became the 「23区の中での位置」 table.
export const sampleTransportTrends: TransportTrend[] = [
  // 新宿
  { year: 2017, passengers: 769_307, station: "新宿" },
  { year: 2018, passengers: 775_000, station: "新宿" },
  { year: 2019, passengers: 778_618, station: "新宿" },
  { year: 2020, passengers: 432_100, station: "新宿" },
  { year: 2021, passengers: 498_300, station: "新宿" },
  { year: 2022, passengers: 612_500, station: "新宿" },
  { year: 2023, passengers: 698_200, station: "新宿" },
  { year: 2024, passengers: 745_800, station: "新宿" },
  // 渋谷
  { year: 2017, passengers: 362_940, station: "渋谷" },
  { year: 2018, passengers: 366_000, station: "渋谷" },
  { year: 2019, passengers: 370_200, station: "渋谷" },
  { year: 2020, passengers: 198_400, station: "渋谷" },
  { year: 2021, passengers: 228_100, station: "渋谷" },
  { year: 2022, passengers: 289_500, station: "渋谷" },
  { year: 2023, passengers: 332_800, station: "渋谷" },
  { year: 2024, passengers: 356_100, station: "渋谷" },
  // 池袋
  { year: 2017, passengers: 551_102, station: "池袋" },
  { year: 2018, passengers: 555_200, station: "池袋" },
  { year: 2019, passengers: 558_623, station: "池袋" },
  { year: 2020, passengers: 312_800, station: "池袋" },
  { year: 2021, passengers: 365_400, station: "池袋" },
  { year: 2022, passengers: 445_600, station: "池袋" },
  { year: 2023, passengers: 502_100, station: "池袋" },
  { year: 2024, passengers: 538_400, station: "池袋" },
];
