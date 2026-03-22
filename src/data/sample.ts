import type {
  DataLayer,
  DemographicsData,
  DisasterRisk,
  LandPricePoint,
  LandPriceSummary,
  PopulationTrend,
  TransportStation,
  TransportTrend,
  WardProfile,
  ZoningArea,
} from "@/types";

export const dataLayers: DataLayer[] = [
  { id: "land-price", label: "地価", description: "公示地価・基準地価", color: "#ef4444", enabled: true },
  { id: "demographics", label: "人口統計", description: "人口・世帯数・年齢構成", color: "#3b82f6", enabled: false },
  { id: "disaster-risk", label: "災害リスク", description: "洪水・地震・土砂災害・津波", color: "#f59e0b", enabled: false },
  { id: "transportation", label: "交通", description: "鉄道・バス路線・乗降客数", color: "#10b981", enabled: false },
  { id: "zoning", label: "用途地域", description: "用途地域・容積率・建蔽率", color: "#8b5cf6", enabled: false },
];

export const sampleLandPrices: LandPricePoint[] = [
  { id: "lp-1", lat: 35.6812, lng: 139.7671, price: 5_300_000, year: 2025, address: "東京都千代田区丸の内一丁目", landUse: "商業地" },
  { id: "lp-2", lat: 35.6895, lng: 139.6917, price: 4_120_000, year: 2025, address: "東京都新宿区西新宿二丁目", landUse: "商業地" },
  { id: "lp-3", lat: 35.6585, lng: 139.7454, price: 3_850_000, year: 2025, address: "東京都港区六本木六丁目", landUse: "商業地" },
  { id: "lp-4", lat: 35.7296, lng: 139.7109, price: 1_280_000, year: 2025, address: "東京都豊島区東池袋一丁目", landUse: "商業地" },
  { id: "lp-5", lat: 35.6622, lng: 139.7038, price: 2_950_000, year: 2025, address: "東京都渋谷区道玄坂一丁目", landUse: "商業地" },
  { id: "lp-6", lat: 35.6710, lng: 139.7636, price: 4_600_000, year: 2025, address: "東京都中央区銀座四丁目", landUse: "商業地" },
  { id: "lp-7", lat: 35.6284, lng: 139.7387, price: 1_850_000, year: 2025, address: "東京都品川区北品川一丁目", landUse: "商業地" },
  { id: "lp-8", lat: 35.7100, lng: 139.8107, price: 420_000, year: 2025, address: "東京都江東区豊洲三丁目", landUse: "住宅地" },
];

// 全23区のデモグラフィクスデータ
export const sampleDemographics: DemographicsData[] = [
  { region: "千代田区", population: 67_927, density: 5_830, growthRate: 2.1, ageGroups: { young: 11, working: 68, elderly: 21 } },
  { region: "中央区", population: 174_073, density: 17_110, growthRate: 3.5, ageGroups: { young: 13, working: 70, elderly: 17 } },
  { region: "港区", population: 260_486, density: 12_770, growthRate: 1.8, ageGroups: { young: 12, working: 67, elderly: 21 } },
  { region: "新宿区", population: 349_385, density: 19_100, growthRate: 0.5, ageGroups: { young: 9, working: 69, elderly: 22 } },
  { region: "文京区", population: 240_069, density: 21_260, growthRate: 1.3, ageGroups: { young: 12, working: 67, elderly: 21 } },
  { region: "台東区", population: 211_444, density: 20_910, growthRate: 0.9, ageGroups: { young: 10, working: 66, elderly: 24 } },
  { region: "墨田区", population: 275_082, density: 19_980, growthRate: 0.7, ageGroups: { young: 11, working: 65, elderly: 24 } },
  { region: "江東区", population: 524_310, density: 13_050, growthRate: 2.4, ageGroups: { young: 13, working: 67, elderly: 20 } },
  { region: "品川区", population: 422_488, density: 18_500, growthRate: 1.1, ageGroups: { young: 11, working: 68, elderly: 21 } },
  { region: "目黒区", population: 287_750, density: 19_540, growthRate: 0.6, ageGroups: { young: 11, working: 67, elderly: 22 } },
  { region: "大田区", population: 748_081, density: 12_300, growthRate: 0.2, ageGroups: { young: 11, working: 64, elderly: 25 } },
  { region: "世田谷区", population: 939_099, density: 16_200, growthRate: 0.8, ageGroups: { young: 12, working: 65, elderly: 23 } },
  { region: "渋谷区", population: 243_883, density: 16_020, growthRate: 1.2, ageGroups: { young: 10, working: 70, elderly: 20 } },
  { region: "中野区", population: 344_880, density: 22_120, growthRate: 0.4, ageGroups: { young: 9, working: 68, elderly: 23 } },
  { region: "杉並区", population: 591_108, density: 17_360, growthRate: 0.3, ageGroups: { young: 10, working: 66, elderly: 24 } },
  { region: "豊島区", population: 301_599, density: 23_200, growthRate: 0.3, ageGroups: { young: 9, working: 67, elderly: 24 } },
  { region: "北区", population: 355_213, density: 17_230, growthRate: -0.2, ageGroups: { young: 10, working: 63, elderly: 27 } },
  { region: "荒川区", population: 217_475, density: 21_400, growthRate: 0.1, ageGroups: { young: 11, working: 64, elderly: 25 } },
  { region: "板橋区", population: 584_483, density: 18_140, growthRate: 0.1, ageGroups: { young: 11, working: 65, elderly: 24 } },
  { region: "練馬区", population: 752_608, density: 15_650, growthRate: 0.4, ageGroups: { young: 12, working: 64, elderly: 24 } },
  { region: "足立区", population: 695_043, density: 13_060, growthRate: -0.3, ageGroups: { young: 11, working: 62, elderly: 27 } },
  { region: "葛飾区", population: 464_526, density: 13_360, growthRate: -0.1, ageGroups: { young: 12, working: 63, elderly: 25 } },
  { region: "江戸川区", population: 697_932, density: 13_990, growthRate: -0.2, ageGroups: { young: 13, working: 64, elderly: 23 } },
];

export const sampleDisasterRisks: DisasterRisk[] = [
  { id: "dr-1", type: "flood", level: 5, region: "江東区", description: "荒川氾濫時の最大浸水深 5m以上。広範囲で2階以上浸水" },
  { id: "dr-2", type: "flood", level: 4, region: "足立区", description: "荒川・中川氾濫時の浸水深 3-5m" },
  { id: "dr-3", type: "flood", level: 4, region: "葛飾区", description: "中川・江戸川氾濫時の浸水深 3-5m" },
  { id: "dr-4", type: "flood", level: 3, region: "江戸川区", description: "荒川氾濫時の浸水深 1-3m" },
  { id: "dr-5", type: "earthquake", level: 5, region: "墨田区", description: "建物倒壊危険度ランク5。木造密集地域" },
  { id: "dr-6", type: "earthquake", level: 4, region: "荒川区", description: "火災危険度ランク4。延焼リスク高" },
  { id: "dr-7", type: "earthquake", level: 4, region: "台東区", description: "建物倒壊危険度ランク4" },
  { id: "dr-8", type: "earthquake", level: 3, region: "北区", description: "火災危険度ランク3" },
  { id: "dr-9", type: "tsunami", level: 2, region: "江戸川区", description: "東京湾内湾の津波リスク（低）" },
  { id: "dr-10", type: "tsunami", level: 2, region: "品川区", description: "東京湾岸の津波リスク（低）" },
  { id: "dr-11", type: "landslide", level: 3, region: "世田谷区", description: "国分寺崖線沿いの土砂災害警戒区域" },
  { id: "dr-12", type: "landslide", level: 2, region: "北区", description: "飛鳥山周辺の急傾斜地" },
];

// 10主要駅
export const sampleTransportStations: TransportStation[] = [
  { id: "ts-1", name: "新宿駅", lat: 35.6896, lng: 139.7006, type: "train", dailyPassengers: 775_386, ward: "新宿区", lines: ["JR山手線", "中央線", "小田急線", "京王線", "都営新宿線", "丸ノ内線", "都営大江戸線"] },
  { id: "ts-2", name: "池袋駅", lat: 35.7295, lng: 139.7109, type: "train", dailyPassengers: 558_623, ward: "豊島区", lines: ["JR山手線", "東武東上線", "西武池袋線", "丸ノ内線", "有楽町線", "副都心線"] },
  { id: "ts-3", name: "東京駅", lat: 35.6812, lng: 139.7671, type: "train", dailyPassengers: 462_589, ward: "千代田区", lines: ["東海道新幹線", "JR山手線", "中央線", "京葉線", "丸ノ内線"] },
  { id: "ts-4", name: "品川駅", lat: 35.6284, lng: 139.7387, type: "train", dailyPassengers: 374_601, ward: "品川区", lines: ["東海道新幹線", "JR山手線", "京急線"] },
  { id: "ts-5", name: "渋谷駅", lat: 35.658, lng: 139.7016, type: "train", dailyPassengers: 366_128, ward: "渋谷区", lines: ["JR山手線", "東急東横線", "銀座線", "半蔵門線", "副都心線"] },
  { id: "ts-6", name: "北千住駅", lat: 35.7497, lng: 139.8049, type: "train", dailyPassengers: 246_855, ward: "足立区", lines: ["JR常磐線", "東武スカイツリーライン", "千代田線", "日比谷線", "つくばエクスプレス"] },
  { id: "ts-7", name: "上野駅", lat: 35.7141, lng: 139.7774, type: "train", dailyPassengers: 187_532, ward: "台東区", lines: ["東北新幹線", "JR山手線", "京浜東北線", "銀座線", "日比谷線"] },
  { id: "ts-8", name: "秋葉原駅", lat: 35.6984, lng: 139.7731, type: "train", dailyPassengers: 172_486, ward: "千代田区", lines: ["JR山手線", "京浜東北線", "総武線", "日比谷線", "つくばエクスプレス"] },
  { id: "ts-9", name: "目黒駅", lat: 35.6337, lng: 139.7158, type: "train", dailyPassengers: 148_920, ward: "品川区", lines: ["JR山手線", "東急目黒線", "南北線", "三田線"] },
  { id: "ts-10", name: "中目黒駅", lat: 35.6440, lng: 139.6987, type: "train", dailyPassengers: 132_450, ward: "目黒区", lines: ["東急東横線", "日比谷線"] },
];

// 全23区の地価サマリー
export const sampleLandPriceSummary: LandPriceSummary[] = [
  { region: "千代田区", avgPrice: 5_300_000, maxPrice: 8_200_000, minPrice: 2_100_000, changeRate: 4.2, count: 38 },
  { region: "中央区", avgPrice: 4_800_000, maxPrice: 7_600_000, minPrice: 1_800_000, changeRate: 3.8, count: 42 },
  { region: "港区", avgPrice: 3_850_000, maxPrice: 6_500_000, minPrice: 1_500_000, changeRate: 3.1, count: 55 },
  { region: "新宿区", avgPrice: 4_120_000, maxPrice: 5_900_000, minPrice: 980_000, changeRate: 2.5, count: 31 },
  { region: "渋谷区", avgPrice: 2_950_000, maxPrice: 5_200_000, minPrice: 850_000, changeRate: 2.8, count: 28 },
  { region: "豊島区", avgPrice: 1_280_000, maxPrice: 2_400_000, minPrice: 680_000, changeRate: 1.5, count: 22 },
  { region: "文京区", avgPrice: 1_150_000, maxPrice: 2_100_000, minPrice: 620_000, changeRate: 1.8, count: 20 },
  { region: "台東区", avgPrice: 1_080_000, maxPrice: 1_950_000, minPrice: 550_000, changeRate: 2.1, count: 18 },
  { region: "品川区", avgPrice: 980_000, maxPrice: 1_700_000, minPrice: 520_000, changeRate: 1.6, count: 25 },
  { region: "目黒区", avgPrice: 1_050_000, maxPrice: 1_800_000, minPrice: 620_000, changeRate: 1.2, count: 19 },
  { region: "江東区", avgPrice: 620_000, maxPrice: 1_100_000, minPrice: 380_000, changeRate: 3.2, count: 30 },
  { region: "世田谷区", avgPrice: 680_000, maxPrice: 1_200_000, minPrice: 420_000, changeRate: 0.8, count: 35 },
  { region: "大田区", avgPrice: 520_000, maxPrice: 950_000, minPrice: 320_000, changeRate: 0.5, count: 28 },
  { region: "足立区", avgPrice: 310_000, maxPrice: 580_000, minPrice: 180_000, changeRate: 0.3, count: 22 },
  { region: "葛飾区", avgPrice: 290_000, maxPrice: 520_000, minPrice: 170_000, changeRate: 0.2, count: 20 },
  { region: "江戸川区", avgPrice: 320_000, maxPrice: 560_000, minPrice: 190_000, changeRate: 0.1, count: 24 },
];

export const samplePopulationTrends: PopulationTrend[] = [
  { year: 2000, population: 8_134_688, region: "東京23区" },
  { year: 2005, population: 8_489_653, region: "東京23区" },
  { year: 2010, population: 8_945_695, region: "東京23区" },
  { year: 2015, population: 9_272_740, region: "東京23区" },
  { year: 2020, population: 9_733_276, region: "東京23区" },
  { year: 2025, population: 9_820_000, region: "東京23区" },
];

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

export const sampleZoning: ZoningArea[] = [
  { id: "z-1", type: "commercial", label: "商業地域", color: "#ef4444", maxFloorAreaRatio: 800, maxBuildingCoverage: 80, areaPct: 12 },
  { id: "z-2", type: "neighborhood-commercial", label: "近隣商業地域", color: "#f9a8d4", maxFloorAreaRatio: 400, maxBuildingCoverage: 80, areaPct: 8 },
  { id: "z-3", type: "residential-1-low", label: "一低住専", color: "#2d8a4e", maxFloorAreaRatio: 150, maxBuildingCoverage: 50, areaPct: 18 },
  { id: "z-4", type: "residential-1-mid", label: "一中住専", color: "#a8d5a2", maxFloorAreaRatio: 300, maxBuildingCoverage: 60, areaPct: 15 },
  { id: "z-5", type: "residential-1", label: "一種住居", color: "#fef3a8", maxFloorAreaRatio: 400, maxBuildingCoverage: 60, areaPct: 22 },
  { id: "z-6", type: "quasi-residential", label: "準住居", color: "#fbbf24", maxFloorAreaRatio: 400, maxBuildingCoverage: 60, areaPct: 5 },
  { id: "z-7", type: "quasi-industrial", label: "準工業", color: "#c4b5fd", maxFloorAreaRatio: 400, maxBuildingCoverage: 60, areaPct: 10 },
  { id: "z-8", type: "industrial", label: "工業", color: "#93c5fd", maxFloorAreaRatio: 400, maxBuildingCoverage: 60, areaPct: 10 },
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
