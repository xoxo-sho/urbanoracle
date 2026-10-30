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

/** The compact line a key-metric tile shows under its figure: the year and the table. */
export function tileSourceLine(source: FieldSource): string {
  return `${source.year}年国勢調査 e-Stat ${source.table}`;
}
