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

/**
 * One ward (or the 23区) of /api/v1/disaster-risks (real-data plan PR 7,
 * Architect decisions 1, 8 and the sub-decisions of 2026-11-05): each hazard
 * in its source's own classes, never a scale of ours.
 */
export type QuakeKind = "total" | "building" | "fire";

/** 東京都 地域危険度 第9回: the ward's 町丁目 per rank 1–5 (a relative evaluation among the 都's 町丁目). */
export interface QuakeRanks {
  n: number;
  ranks: Record<QuakeKind, number[]>;
  rank5: number;
  rank5Share: number; // % of the ward's 町丁目 at 総合危険度 rank 5
  relative: string;
}

/** One depth class of 洪水 (A31a 浸水深ランク) or 高潮 (A49): its area in the ward and its share of the ward's area. */
export interface DepthClass {
  code: number;
  label: string;
  m2: number;
  share: number; // % of the N03 ward polygon
}

export interface DepthShares {
  wardM2: number;
  m2: number;
  share: number;
  classes: DepthClass[];
}

export interface FloodShares extends DepthShares {
  deepM2: number;
  deepShare: number; // % of the ward with 浸水深 3 m 以上 (ランク 3 以上)
}

export interface LandslideCounts {
  phenomena: { code: number; name: string; warning: number; special: number }[];
  warning: number;
  special: number;
}

export interface DisasterWard {
  region: string;
  code: string;
  earthquake: QuakeRanks;
  flood: FloodShares;
  landslide: LandslideCounts;
  tsunami: { status: "notCovered"; text: string };
  hightide: DepthShares;
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
