import type {
  DataLayer,
  TransportTrend,
  WardProfile,
} from "@/types";

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

// 5主要駅の年次推移（COVID影響あり）
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

export const sampleWardProfiles: WardProfile[] = [
  { region: "千代田区", population: 15, landPrice: 95, accessibility: 98, safety: 85, greenRatio: 40 },
  { region: "中央区", population: 35, landPrice: 88, accessibility: 92, safety: 70, greenRatio: 25 },
  { region: "港区", population: 55, landPrice: 82, accessibility: 90, safety: 80, greenRatio: 45 },
  { region: "新宿区", population: 72, landPrice: 75, accessibility: 95, safety: 65, greenRatio: 30 },
  { region: "文京区", population: 50, landPrice: 48, accessibility: 80, safety: 82, greenRatio: 42 },
  { region: "台東区", population: 45, landPrice: 45, accessibility: 78, safety: 55, greenRatio: 20 },
  { region: "墨田区", population: 58, landPrice: 32, accessibility: 70, safety: 30, greenRatio: 22 },
  { region: "江東区", population: 62, landPrice: 28, accessibility: 72, safety: 35, greenRatio: 30 },
  { region: "品川区", population: 68, landPrice: 42, accessibility: 85, safety: 78, greenRatio: 35 },
  { region: "目黒区", population: 55, landPrice: 45, accessibility: 82, safety: 80, greenRatio: 38 },
  { region: "大田区", population: 82, landPrice: 22, accessibility: 65, safety: 72, greenRatio: 40 },
  { region: "世田谷区", population: 100, landPrice: 30, accessibility: 60, safety: 90, greenRatio: 65 },
  { region: "渋谷区", population: 52, landPrice: 70, accessibility: 88, safety: 75, greenRatio: 35 },
  { region: "中野区", population: 65, landPrice: 28, accessibility: 72, safety: 70, greenRatio: 25 },
  { region: "杉並区", population: 75, landPrice: 25, accessibility: 62, safety: 82, greenRatio: 55 },
  { region: "豊島区", population: 60, landPrice: 52, accessibility: 90, safety: 60, greenRatio: 18 },
  { region: "北区", population: 65, landPrice: 20, accessibility: 68, safety: 55, greenRatio: 45 },
  { region: "荒川区", population: 48, landPrice: 18, accessibility: 65, safety: 42, greenRatio: 22 },
  { region: "板橋区", population: 72, landPrice: 18, accessibility: 60, safety: 75, greenRatio: 42 },
  { region: "練馬区", population: 80, landPrice: 15, accessibility: 52, safety: 85, greenRatio: 62 },
  { region: "足立区", population: 78, landPrice: 12, accessibility: 45, safety: 40, greenRatio: 50 },
  { region: "葛飾区", population: 68, landPrice: 10, accessibility: 48, safety: 45, greenRatio: 48 },
  { region: "江戸川区", population: 78, landPrice: 12, accessibility: 50, safety: 42, greenRatio: 55 },
];
