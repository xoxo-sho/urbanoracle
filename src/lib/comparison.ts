import type { DemographicsData, DisasterWard, FieldSource, FieldSources, GreenWard, LandPriceTotal, LandPriceWard, TransportStation } from "@/types";
import type { DataStatus } from "@/lib/use-gated-data";
import { TOKYO_WARD_NAMES } from "@/lib/wards";
import { formatChange, manPrice } from "@/lib/land-price";
import { formatShare } from "@/lib/zoning";
import { MENCHO_EDITION } from "@/lib/credits";
import { hasValue } from "@/lib/format";

/**
 * 「23区の中での位置」 (real-data plan PR 8, Architect decision 7, 2026-11-09).
 *
 * One row per measure, each from its own endpoint: the ward's value with its
 * unit, the 23-ward rank (largest first, the order stated on the row; ties
 * share a rank — competition ranking), and the 23区 figure computed for the 23
 * wards as a whole (a total over a total, never a mean of the ward values).
 * Nothing here says whether a value is good or bad, and nothing is a score.
 *
 * Each row follows PR 1's states on its own: a row is 読み込み中 or 取得失敗 when
 * the endpoint it reads is, and a rank exists only over a complete set of 23
 * values.
 */

export type MeasureKey = "density" | "growth" | "price" | "ridership" | "rank5" | "flood" | "green";
export type RowState = "loading" | "unavailable" | "ok";
export const RANK_ORDER = { value: "値の大きい順", share: "割合の高い順" } as const;
export const TIE_RULE = "同値は同順位";

export interface Measure {
  key: MeasureKey;
  label: string;
  order: (typeof RANK_ORDER)[keyof typeof RANK_ORDER];
  state: RowState;
  /** Per ward, when the answer holds a figure; complete only with all 23. */
  values: Record<string, number>;
  complete: boolean;
  /** The 23区 figure over the 23 wards as a whole; null when it cannot be computed. */
  total: number | null;
  format: (v: number) => string;
  /** The source with its 時点, from the payload; null when the payload names none. */
  source: string | null;
  /** A note per ward printed beside its value (the 住宅地 point count). */
  note?: (ward: string) => string | null;
}

export interface Ranked {
  rank: number;
  tied: boolean;
}

/** Competition ranking, largest first: 1 + the number of wards with a larger value. */
export function rankOf(values: Record<string, number>, ward: string): Ranked | null {
  const v = values[ward];
  if (!hasValue(v)) return null;
  const all = Object.values(values);
  return { rank: 1 + all.filter((x) => x > v).length, tied: all.filter((x) => x === v).length > 1 };
}

/** The highest and the lowest value, each with the wards that hold it (23区 order). */
export function extremes(values: Record<string, number>): { max: { value: number; wards: string[] }; min: { value: number; wards: string[] } } | null {
  const wards = TOKYO_WARD_NAMES.filter((w) => hasValue(values[w]));
  if (wards.length === 0) return null;
  const max = Math.max(...wards.map((w) => values[w]));
  const min = Math.min(...wards.map((w) => values[w]));
  return {
    max: { value: max, wards: wards.filter((w) => values[w] === max) },
    min: { value: min, wards: wards.filter((w) => values[w] === min) },
  };
}

/** 「label（table、2025年）」 — the year added unless the label already says it. */
export function sourceWithDate(s: FieldSource | undefined): string | null {
  if (!s || !Number.isFinite(s.year)) return null;
  const date = s.label.includes(`${s.year}年`) ? "" : `、${s.year}年`;
  return `${s.label}（${s.table}${date}）`;
}

function stateOf(status: DataStatus, unavailable: readonly string[] = [], field?: string): RowState {
  if (status === "loading") return "loading";
  if (status === "unavailable") return "unavailable";
  if (status === "partial" && field && unavailable.includes(field)) return "unavailable";
  return "ok";
}

/** The worse of two states: a row that needs two answers waits for, or fails with, either. */
function both(a: RowState, b: RowState): RowState {
  if (a === "unavailable" || b === "unavailable") return "unavailable";
  if (a === "loading" || b === "loading") return "loading";
  return "ok";
}

function collect<T>(rows: readonly T[], name: (r: T) => string, value: (r: T) => number | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const v = value(r);
    if (hasValue(v)) out[name(r)] = v;
  }
  return out;
}

const isComplete = (values: Record<string, number>) => TOKYO_WARD_NAMES.every((w) => hasValue(values[w]));
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export interface ComparisonInputs {
  census: { status: DataStatus; rows: readonly (DemographicsData & { areaKm2?: number | null })[]; unavailable: readonly string[]; sources: FieldSources };
  land: { status: DataStatus; rows: readonly LandPriceWard[]; total: LandPriceTotal | null; sources: FieldSources };
  transport: { status: DataStatus; stations: readonly TransportStation[]; sources: FieldSources };
  disaster: { status: DataStatus; rows: readonly DisasterWard[]; total: DisasterWard | null; sources: FieldSources };
  green: { status: DataStatus; rows: readonly GreenWard[]; total: GreenWard | null; sources: FieldSources };
}

export const MEASURE_LABEL: Record<MeasureKey, string> = {
  density: "人口密度",
  growth: "人口増減率（2020→2025年）",
  price: "住宅地 平均価格",
  ridership: "日間乗降客（区の面積1km²あたり）",
  rank5: "総合危険度ランク5の町丁目の割合",
  flood: "浸水深3m以上の面積割合（想定最大規模）",
  green: "公園等・農用地・森林・原野の面積割合",
};

export function buildMeasures({ census, land, transport, disaster, green }: ComparisonInputs): Measure[] {
  const byRegion = (r: { region: string }) => r.region;

  // 1–2: the census (PR 2). The 23区 density is Σpopulation ÷ Σarea; the 23区
  // growth is Σ2025 ÷ Σ2020 − 1, each ward's 2020 count recovered from its rate.
  const densityState = stateOf(census.status, census.unavailable, "density");
  const density = collect(census.rows, byRegion, (r) => r.density);
  const area = collect(census.rows, byRegion, (r) => r.areaKm2);
  const population = collect(census.rows, byRegion, (r) => r.population);
  const totalArea = isComplete(area) ? sum(TOKYO_WARD_NAMES.map((w) => area[w])) : null;
  const totalPopulation = isComplete(population) ? sum(TOKYO_WARD_NAMES.map((w) => population[w])) : null;

  const growthState = stateOf(census.status, census.unavailable, "growthRate");
  const growth = collect(census.rows, byRegion, (r) => r.growthRate);
  const population2020 = isComplete(growth) && totalPopulation !== null ? sum(TOKYO_WARD_NAMES.map((w) => population[w] / (1 + growth[w] / 100))) : null;

  // 3: the 地価公示 住宅地 mean (PR 5); the 23区 figure is the mean over every point, the payload's own `total`.
  const price = collect(land.rows, byRegion, (r) => r.residential?.meanPrice);
  const priceN = Object.fromEntries(land.rows.map((r) => [r.region, r.residential?.n]));

  // 4: K3 (PR 4) ÷ the same 面積調 area PR 2 divides by. A ward with stations
  // but no figure on any of them is left out rather than read as 0.
  const ridershipState = both(stateOf(transport.status), densityState);
  const k3: Record<string, number> = {};
  for (const w of TOKYO_WARD_NAMES) {
    const figures = transport.stations.filter((s) => s.ward === w).map((s) => s.dailyPassengers).filter(hasValue);
    const hasStations = transport.stations.some((s) => s.ward === w);
    if (!hasStations || figures.length > 0) k3[w] = sum(figures);
  }
  const ridership: Record<string, number> = {};
  for (const w of TOKYO_WARD_NAMES) if (hasValue(k3[w]) && hasValue(area[w])) ridership[w] = k3[w] / area[w];
  const ridershipSourceLine = sourceWithDate(transport.sources?.ridership);

  // 5–6: 地域危険度 第9回 and A31a-25 (PR 7); the 23区 figures are the payload's `total`.
  const disasterState = stateOf(disaster.status);
  const rank5 = collect(disaster.rows, byRegion, (r) => r.earthquake?.rank5Share);
  const flood = collect(disaster.rows, byRegion, (r) => r.flood?.deepShare);

  // 7: 土地利用現況調査 令和3年 (PR 8, decision 6); the 23区 figure is the payload's `total` over the 23 ward rows.
  const greenShare = collect(green.rows, byRegion, (r) => r.share);

  const rows: Omit<Measure, "complete">[] = [
    {
      key: "density",
      label: MEASURE_LABEL.density,
      order: RANK_ORDER.value,
      state: densityState,
      values: density,
      total: totalArea !== null && totalPopulation !== null ? Math.round(totalPopulation / totalArea) : null,
      format: (v) => `${Math.round(v).toLocaleString("ja-JP")}人/km²`,
      source: sourceWithDate(census.sources?.density),
    },
    {
      key: "growth",
      label: MEASURE_LABEL.growth,
      order: RANK_ORDER.value,
      state: growthState,
      values: growth,
      total: population2020 !== null && totalPopulation !== null ? (totalPopulation / population2020 - 1) * 100 : null,
      format: formatChange,
      source: sourceWithDate(census.sources?.growthRate),
    },
    {
      key: "price",
      label: MEASURE_LABEL.price,
      order: RANK_ORDER.value,
      state: stateOf(land.status),
      values: price,
      total: land.total?.residential?.meanPrice ?? null,
      format: (v) => `${manPrice(v)}円/m²`,
      source: sourceWithDate(land.sources?.price),
      note: (w) => (hasValue(priceN[w]) ? `住宅地 n=${priceN[w]}` : null),
    },
    {
      key: "ridership",
      label: MEASURE_LABEL.ridership,
      order: RANK_ORDER.value,
      state: ridershipState,
      values: ridership,
      total: totalArea !== null && isComplete(k3) ? sum(TOKYO_WARD_NAMES.map((w) => k3[w])) / totalArea : null,
      format: (v) => `${Math.round(v).toLocaleString("ja-JP")}人/日/km²`,
      source: ridershipSourceLine ? `${ridershipSourceLine} ÷ 区の面積（${MENCHO_EDITION}）` : null,
    },
    {
      key: "rank5",
      label: MEASURE_LABEL.rank5,
      order: RANK_ORDER.share,
      state: disasterState,
      values: rank5,
      total: disaster.total?.earthquake?.rank5Share ?? null,
      format: formatShare,
      source: sourceWithDate(disaster.sources?.earthquake),
    },
    {
      key: "flood",
      label: MEASURE_LABEL.flood,
      order: RANK_ORDER.share,
      state: disasterState,
      values: flood,
      total: disaster.total?.flood?.deepShare ?? null,
      format: formatShare,
      source: sourceWithDate(disaster.sources?.flood),
    },
    {
      key: "green",
      label: MEASURE_LABEL.green,
      order: RANK_ORDER.share,
      state: stateOf(green.status),
      values: greenShare,
      total: green.total?.share ?? null,
      format: formatShare,
      source: sourceWithDate(green.sources?.green),
    },
  ];
  return rows.map((r) => ({ ...r, complete: r.state === "ok" && isComplete(r.values) }));
}
