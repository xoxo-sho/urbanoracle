import type { DemographicsData, FieldSources } from "@/types";
import type { DataStatus } from "@/lib/use-gated-data";
import { FAILED_TEXT, LOADING_TEXT } from "@/components/dashboard/DataState";
import { NO_DATA, hasValue } from "@/lib/format";

/**
 * The 人口 choropleth and its hover tooltip (real-data plan PR 8): both read
 * the /demographics payload — the 2025 census population and its density
 * (population ÷ the 面積調 area) — never a table typed into the code. Until
 * PR 8 they read WARD_META in ward-boundaries.ts, unlabelled figures of no
 * stated year that production showed as if they were the census.
 */

/** The fill's three stops, from the data: the lowest, the median and the highest ward density. Null with no figures. */
export function densityStops(rows: readonly Pick<DemographicsData, "density">[]): number[] | null {
  const values = rows.map((r) => r.density).filter(hasValue).sort((a, b) => a - b);
  if (values.length === 0) return null;
  return [values[0], values[Math.floor(values.length / 2)], values[values.length - 1]];
}

/** 「（2025年国勢調査）」 from the payload's year for the field, or nothing when it names none. */
function yearTag(sources: FieldSources, field: string): string {
  const year = sources[field]?.year;
  return Number.isFinite(year) ? `（${year}年国勢調査）` : "";
}

/**
 * The tooltip's 人口 and 密度 lines for one ward: 「66,270人（2025年国勢調査）」 and
 * 「5,838人/km²（2025年国勢調査）」, or the state the census answer is in.
 */
export function censusTooltip(
  row: Pick<DemographicsData, "population" | "density"> | null | undefined,
  sources: FieldSources,
  status: DataStatus
): { population: string; density: string } {
  if (status === "loading") return { population: LOADING_TEXT, density: LOADING_TEXT };
  if (status === "unavailable") return { population: FAILED_TEXT, density: FAILED_TEXT };
  const missing = status === "partial" ? FAILED_TEXT : NO_DATA;
  return {
    population: row && hasValue(row.population) ? `${row.population.toLocaleString("ja-JP")}人${yearTag(sources, "population")}` : missing,
    density: row && hasValue(row.density) ? `${row.density.toLocaleString("ja-JP")}人/km²${yearTag(sources, "density")}` : missing,
  };
}

/** The legend's line under the ramp: the census year the fill shows, from the payload. */
export function densityLegendSource(sources: FieldSources | null | undefined): string | null {
  const s = sources?.density;
  return s && Number.isFinite(s.year) ? `${s.year}年国勢調査（人口 ÷ 区の面積）` : null;
}
