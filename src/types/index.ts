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

// Fields are nullable because the upstream statistics suppress cells for
// small populations (e-Stat emits "-", "***", "X"). null means "not
// published" — rendered as データなし — and is deliberately distinct from 0.
/**
 * Where one record field's figures came from, as the server says it
 * (real-data plan PR 2): the year, the e-Stat table and a label a reader can
 * check. Keyed by record field in the envelope's `sources`.
 */
export interface FieldSource {
  year: number;
  table: string;
  label: string;
}
export type FieldSources = Record<string, FieldSource>;

export interface DemographicsData {
  region: string;
  population: number | null;
  density: number | null; // 人/km²
  growthRate: number | null; // % — null when e-Stat has no figure
  ageGroups: {
    young: number | null; // 0-14
    working: number | null; // 15-64
    elderly: number | null; // 65+
  };
}

export interface DisasterRisk {
  id: string;
  type: "flood" | "earthquake" | "landslide" | "tsunami";
  level: 1 | 2 | 3 | 4 | 5;
  region: string;
  description: string;
}

/** One operator at a station (real-data plan PR 4): its lines there and its
 * own 乗降客数 (the 事業者別 panel sums these; a ward's total is their sum). */
export interface StationOperator {
  name: string;
  lines: string[];
  // null when the source counts this operator's passengers on another row
  // (国土数値情報 S12 重複コード 2). Never 0 — that would claim no passengers.
  passengers: number | null;
}

export interface TransportStation {
  id: string;
  /** The source's station group code (S12_001g). */
  code?: string;
  name: string;
  lat: number;
  lng: number;
  type: "train" | "bus" | "subway";
  // The sum over the station's operators; null when none carries a figure.
  // Never 0 — that would claim no passengers.
  dailyPassengers: number | null;
  lines: string[];
  ward?: string;
  wardCode?: string;
  operators?: StationOperator[];
  /** Why the figure is null, when the source says (e.g. counted on another row). */
  note?: string;
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
