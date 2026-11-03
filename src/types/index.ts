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

/** An attribute's area-weighted mean and the min–max of the polygon values (%). */
export interface ZoningRange {
  mean: number;
  min: number;
  max: number;
}

/**
 * One 用途地域 type present in a composition (real-data plan PR 6): A55's code
 * (1–13) and name, its clipped area, its share of the designated area, the
 * polygons it comes from, and the 指定容積率 / 指定建蔽率 figures.
 */
export interface ZoningType {
  code: number;
  name: string;
  m2: number;
  share: number; // % of the designated area
  n: number;
  far: ZoningRange; // 容積率
  bcr: ZoningRange; // 建蔽率
}

/**
 * The 時点 of a composition as the A55 data list states it (Architect
 * decision 2026-11-03, way 1): a ward's date or null when the list does not
 * date it; `text` is the sentence the screen prints as it stands. The 23区
 * view carries the range of the dated wards and the codes without a date.
 */
export interface ZoningAsOf {
  date: string | null;
  basis?: string;
  label: string;
  text: string;
  note?: string;
  from?: string;
  to?: string;
  missing?: string[];
}

/**
 * One record of /api/v1/zoning (a ward) or its `total` (東京23区): the
 * designated area and its share of the N03 ward polygon, and the types
 * present in A55 code order with their shares.
 */
export interface ZoningComposition {
  region: string;
  code: string;
  wardM2: number;
  designatedM2: number;
  designatedShare: number; // % of the ward polygon, ≤ 100
  outsideM2: number;
  polygons: number;
  asOf: ZoningAsOf;
  types: ZoningType[];
}

/**
 * The LP hero's sample set (src/data/sample.ts, HeroSpread.tsx) — the only
 * reader since real-data plan PR 5; PR 7 switches the hero with its downside.
 */
export interface LandPriceSummary {
  region: string;
  avgPrice: number; // 平均地価 円/m²
  maxPrice: number;
  minPrice: number;
  changeRate: number; // 前年比 %
  count: number; // データ地点数
}

/**
 * One use's figures in one ward from the 地価公示 snapshot (real-data plan
 * PR 5, Architect decision 4): the simple mean of the 地価公示価格 over all n
 * points of that use, and the simple mean 対前年変動率 over its nContinuing
 * 継続 points — null when none continues from the previous year, never 0.
 */
export interface LandUseFigures {
  n: number;
  meanPrice: number; // 円/m²
  minPrice?: number;
  maxPrice?: number;
  nContinuing: number;
  meanChange: number | null; // %
}

/** One ward of /api/v1/land-prices: 住宅地 and 商業地 series, 工業地 as a count only. */
export interface LandPriceWard {
  region: string;
  code: string;
  n: number;
  residential: LandUseFigures;
  commercial: LandUseFigures;
  industrial: { n: number };
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
