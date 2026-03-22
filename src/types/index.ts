export type DataCategory =
  | "land-price"
  | "demographics"
  | "disaster-risk"
  | "transportation"
  | "zoning";

export interface DataLayer {
  id: DataCategory;
  label: string;
  description: string;
  color: string;
  enabled: boolean;
}

export interface LandPricePoint {
  id: string;
  lat: number;
  lng: number;
  price: number; // 円/m²
  year: number;
  address: string;
  landUse: string;
}

export interface DemographicsData {
  region: string;
  population: number;
  density: number; // 人/km²
  growthRate: number; // %
  ageGroups: {
    young: number; // 0-14
    working: number; // 15-64
    elderly: number; // 65+
  };
}

export interface DisasterRisk {
  id: string;
  type: "flood" | "earthquake" | "landslide" | "tsunami";
  level: 1 | 2 | 3 | 4 | 5;
  region: string;
  description: string;
}

export interface TransportStation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: "train" | "bus" | "subway";
  dailyPassengers: number;
  lines: string[];
  ward?: string;
}

export interface ZoningArea {
  id: string;
  type: string;
  label: string;
  color: string;
  maxFloorAreaRatio: number; // 容積率
  maxBuildingCoverage: number; // 建蔽率
  areaPct: number; // 面積割合 (%)
}

export interface LandPriceSummary {
  region: string;
  avgPrice: number; // 平均地価 円/m²
  maxPrice: number;
  minPrice: number;
  changeRate: number; // 前年比 %
  count: number; // データ地点数
}

export interface PopulationTrend {
  year: number;
  population: number;
  region: string;
}

export interface TransportTrend {
  year: number;
  passengers: number;
  station: string;
}

export interface WardProfile {
  region: string;
  population: number; // normalized 0-100
  landPrice: number;
  accessibility: number; // 交通利便性
  safety: number; // 安全性 (災害リスク逆数)
  greenRatio: number; // 緑地率
}
