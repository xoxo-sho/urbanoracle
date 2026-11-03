import type { FieldSource, FieldSources } from "@/types";

/**
 * How a census surface names its vintage (real-data plan PR 2).
 *
 * The server says, per record field, which year and which e-Stat table a
 * figure came from (`sources` in the /demographics envelope). Nothing here
 * knows a year of its own: a note built from an empty `sources` names no
 * year at all, rather than a literal that could outlive the table it
 * described (which is how 2020年国勢調査・2025年速報 stood on screen while
 * the figures had moved on).
 */

/** The record fields the census tables fill, in display order. */
export const CENSUS_FIELDS = ["population", "density", "growthRate", "ageGroups"] as const;
export type CensusField = (typeof CENSUS_FIELDS)[number];

const FIELD_JA: Record<CensusField, string> = {
  population: "人口",
  density: "密度",
  growthRate: "増減率",
  ageGroups: "年齢構成",
};

/** The entries present for the given fields, in display order. */
function present(sources: FieldSources, fields: readonly CensusField[]): [CensusField, FieldSource][] {
  return fields.flatMap((f) => (sources[f] ? [[f, sources[f]] as [CensusField, FieldSource]] : []));
}

/** The one year the given fields share, or null when the payload names none or they disagree. */
export function censusYear(sources: FieldSources, fields: readonly CensusField[] = CENSUS_FIELDS): number | null {
  const years = new Set(present(sources, fields).map(([, s]) => s.year));
  return years.size === 1 ? [...years][0] : null;
}

/**
 * The provenance line of a surface showing `fields`:
 * 「2025年国勢調査 ／ 人口: …（e-Stat 0004065881） ／ 年齢構成: …（e-Stat 0004066221）」.
 * Null when the payload names no source for any of them. If the fields do
 * not share a year, each entry carries its own.
 */
export function censusLine(sources: FieldSources, fields: readonly CensusField[] = CENSUS_FIELDS): string | null {
  const entries = present(sources, fields);
  if (entries.length === 0) return null;
  const year = censusYear(sources, fields);
  const parts = entries.map(
    ([field, s]) => `${FIELD_JA[field]}: ${s.label}（e-Stat ${s.table}${year === null ? `, ${s.year}年` : ""}）`
  );
  return [year === null ? null : `${year}年国勢調査`, ...parts].filter((p): p is string => p !== null).join(" ／ ");
}

/**
 * The provenance line of the 人口推移 chart (real-data plan PR 3), from the
 * /population-trends `sources` — one entry per point, keyed by year:
 * 「2000–2025年国勢調査 ／ 2000–2020年: …（e-Stat 000001085987） ／ 2025年: …（e-Stat 0004065881）」.
 * Consecutive years from the same table and label share one span. Null when
 * the payload names nothing — a note built from nothing claims no year.
 */
export function trendLine(sources: FieldSources | null | undefined): string | null {
  const entries = Object.values(sources ?? {})
    .filter((s) => Number.isFinite(s.year))
    .sort((a, b) => a.year - b.year);
  if (entries.length === 0) return null;
  const groups: { from: number; to: number; table: string; label: string }[] = [];
  for (const s of entries) {
    const last = groups[groups.length - 1];
    if (last && last.table === s.table && last.label === s.label) last.to = s.year;
    else groups.push({ from: s.year, to: s.year, table: s.table, label: s.label });
  }
  const span = (g: { from: number; to: number }) => (g.from === g.to ? `${g.from}年` : `${g.from}–${g.to}年`);
  const first = entries[0].year;
  const last = entries[entries.length - 1].year;
  return [
    `${first === last ? first : `${first}–${last}`}年国勢調査`,
    ...groups.map((g) => `${span(g)}: ${g.label}（e-Stat ${g.table}）`),
  ].join(" ／ ");
}

/** The compact line a key-metric tile shows under its figure: the year and the table. */
export function tileSourceLine(source: FieldSource): string {
  return `${source.year}年国勢調査 e-Stat ${source.table}`;
}

// ---- 駅別乗降客数 (real-data plan PR 4) -----------------------------------------

/** The ridership source of the /transport payload, or null when it names none. */
export function ridershipSource(sources: FieldSources | null | undefined): FieldSource | null {
  const s = sources?.ridership;
  return s && Number.isFinite(s.year) ? s : null;
}

/** 「2024年度」, from the payload; null when it names no year. */
export function ridershipYearLabel(sources: FieldSources | null | undefined): string | null {
  const s = ridershipSource(sources);
  return s ? `${s.year}年度` : null;
}

/**
 * The provenance line of the station surfaces:
 * 「2024年度 国土数値情報 駅別乗降客数データ（S12-25） ／ 区の判定: 行政区域データ（N03-20260101）」.
 * Null when the payload names no ridership source.
 */
export function transportLine(sources: FieldSources | null | undefined): string | null {
  const r = ridershipSource(sources);
  if (!r) return null;
  const w = sources?.wards;
  return [`${r.year}年度 国土数値情報 駅別乗降客数データ（${r.table}）`, w ? `区の判定: 行政区域データ（${w.table}）` : null]
    .filter((p): p is string => p !== null)
    .join(" ／ ");
}

/** The compact line a key-metric tile shows under its figure: the year and the table. */
export function transportTileLine(source: FieldSource): string {
  return `${source.year}年度 国土数値情報 ${source.table}`;
}

// ---- 地価公示 (real-data plan PR 5) -----------------------------------------------

/** The price source of the /land-prices payload, or null when it names none. */
export function landPriceSource(sources: FieldSources | null | undefined): FieldSource | null {
  const s = sources?.price;
  return s && Number.isFinite(s.year) ? s : null;
}

/** 「2026年地価公示」, from the payload; null when it names no year. */
export function landPriceYearLabel(sources: FieldSources | null | undefined): string | null {
  const s = landPriceSource(sources);
  return s ? `${s.year}年地価公示` : null;
}

/**
 * The provenance line of the 地価 surfaces:
 * 「2026年地価公示 ／ 国土数値情報 地価公示データ 2026年（令和8年）版 地価公示価格（2026年1月1日時点、円/m²）（L01-26）」.
 * The label carries the reference date as the payload states it. Null when
 * the payload names no price source.
 */
export function landPriceLine(sources: FieldSources | null | undefined): string | null {
  const s = landPriceSource(sources);
  if (!s) return null;
  return `${s.year}年地価公示 ／ ${s.label}（${s.table}）`;
}

// ---- 用途地域 (real-data plan PR 6) ---------------------------------------------

/** The zoning source of the /zoning payload, or null when it names none. */
export function zoningSource(sources: FieldSources | null | undefined): FieldSource | null {
  const s = sources?.zoning;
  return s && Number.isFinite(s.year) ? s : null;
}

/**
 * The provenance line of the 用途地域 surfaces:
 * 「2024年度 国土数値情報 都市計画決定情報データ 2024年度（令和6年度）版 用途地域（…）（A55-24） ／ 区の面積・切り抜き: 行政区域データ（N03-20260101）」.
 * Null when the payload names no zoning source.
 */
export function zoningLine(sources: FieldSources | null | undefined): string | null {
  const z = zoningSource(sources);
  if (!z) return null;
  const w = sources?.wards;
  return [`${z.year}年度 ${z.label}（${z.table}）`, w ? `区の面積・切り抜き: 行政区域データ（${w.table}）` : null]
    .filter((p): p is string => p !== null)
    .join(" ／ ");
}
