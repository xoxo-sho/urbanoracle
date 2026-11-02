"use client";

import type { DemographicsData, FieldSources, LandPriceWard } from "@/types";
import type { DataStatus } from "@/lib/use-gated-data";
import { censusLine, landPriceLine, type CensusField } from "@/lib/census-sources";
import { NO_DATA, byValueDesc, formatK, formatMan, formatPct, hasValue } from "@/lib/format";
import { LAND_USE_LABEL, manPrice, type LandUse } from "@/lib/land-price";
import { LAND_PRICE_MEAN_NOTE } from "@/lib/credits";
import { SOURCES } from "@/lib/sources";
import SourceNote from "@/components/dashboard/SourceNote";
import { FAILED_TEXT, StateNotice, isPending, pendingText } from "@/components/dashboard/DataState";

interface WardTableProps {
  demographics: DemographicsData[];
  /** The /land-prices payload (real-data plan PR 5): the 地価 column's figures for the chosen use. */
  landPrices: LandPriceWard[];
  landUse: LandUse;
  /** State of the /land-prices answer: its cells say 読み込み中 / 取得失敗 while pending. */
  landPriceStatus: DataStatus;
  /** The /land-prices payload's `sources`: the 地価公示 edition and year the column shows. */
  landPriceSources?: FieldSources;
  onSelectWard: (ward: string) => void;
  /** State of the /demographics answer that fills the census columns (the rows). */
  status: DataStatus;
  /** Record fields the server could not fill (status partial): growthRate when the e-Stat growth table is down. */
  unavailable?: readonly string[];
  /** Per census field, the year and e-Stat table the columns came from, as the server says (real-data plan PR 2). */
  sources?: FieldSources;
}

const GROWTH_FIELD = "growthRate";
// The census columns, in table order: 人口, 密度, 増減, 高齢率.
const CENSUS_COLUMNS: readonly CensusField[] = ["population", "density", "growthRate", "ageGroups"];

// Intensity within one semantic axis: stronger value -> stronger step of the
// same hue. Two hues would imply a distinction the data does not make.
function heatColor(value: number | null, min: number, max: number, axis: "up" | "down"): string {
  if (!hasValue(value)) return "var(--muted-foreground)";
  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
  if (ratio > 0.66) return `var(--${axis}-text)`;
  if (ratio > 0.33) return `var(--${axis}-strong)`;
  return "var(--muted-foreground)";
}

// h-audit: data-ramp — a hard two-stop fill boundary IS the bar, not decoration.
function miniBar(value: number | null, max: number, color: string): string {
  if (!hasValue(value) || max <= 0) return "transparent";
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return `linear-gradient(90deg, ${color} ${pct}%, transparent ${pct}%)`;
}

export default function WardTable({
  demographics,
  landPrices,
  landUse,
  landPriceStatus,
  landPriceSources = {},
  onSelectWard,
  status,
  unavailable = [],
  sources = {},
}: WardTableProps) {
  const use = LAND_USE_LABEL[landUse];
  const landPending = isPending(landPriceStatus);
  const landProvenance = landPriceLine(landPriceSources);
  // The growth table did not answer: the 増減 column is 取得失敗 in every row,
  // not the データなし a suppressed cell gets, and its source is not claimed.
  const growthFailed = unavailable.includes(GROWTH_FIELD);
  const columns = growthFailed ? CENSUS_COLUMNS.filter((f) => f !== GROWTH_FIELD) : CENSUS_COLUMNS;
  const vintage = censusLine(sources, columns);
  const sorted = [...demographics].sort((a, b) => byValueDesc(a.population, b.population)).slice(0, 12);
  const populations = sorted.map((d) => d.population).filter(hasValue);
  const maxPop = populations.length ? Math.max(...populations) : 0;
  const prices = new Map(landPrices.map((p) => [p.region, p[landUse]]));

  return (
    <div className="chart-section overflow-x-auto">
      <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        区別データテーブル
      </h4>
      {isPending(status) ? (
        // The rows are the census; without it there is no table to hang the
        // 地価 column on.
        <StateNotice status={status} source={SOURCES.estat.label} />
      ) : (
        <>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-muted-foreground border-b border-border/50">
                <th className="text-left py-1.5 pr-2 font-medium">区</th>
                <th className="text-right py-1.5 px-2 font-medium">人口</th>
                <th className="text-right py-1.5 px-2 font-medium">密度</th>
                <th className="text-right py-1.5 px-2 font-medium">増減</th>
                <th className="text-right py-1.5 px-2 font-medium">高齢率</th>
                <th className="text-right py-1.5 px-2 font-medium" data-price-header>
                  平均価格（{use}）
                </th>
                <th className="py-1.5 pl-2 font-medium w-20">規模</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((d, i) => {
                const price = prices.get(d.region);
                return (
                  <tr
                    key={d.region}
                    className="border-b border-border/30 transition-colors hover:bg-accent/30 cursor-pointer animate-fade-in-up"
                    style={{ animationDelay: `${i * 0.03}s`, opacity: 0 }}
                    onClick={() => onSelectWard(d.region)}
                  >
                    <td className="py-1.5 pr-2 font-medium text-primary hover:underline">{d.region.replace("区", "")}</td>
                    <td className="text-right py-1.5 px-2 tabular-nums">{formatMan(d.population)}</td>
                    <td className="text-right py-1.5 px-2 tabular-nums">
                      <span style={{ color: heatColor(d.density, 5000, 24000, "up") }}>
                        {formatK(d.density)}
                      </span>
                    </td>
                    <td className="text-right py-1.5 px-2 tabular-nums">
                      {growthFailed ? (
                        <span style={{ color: "var(--down-text)" }}>{FAILED_TEXT}</span>
                      ) : (
                        <span style={{ color: (d.growthRate ?? 0) >= 0 ? "var(--up-text)" : "var(--down-text)" }}>
                          {hasValue(d.growthRate) ? `${d.growthRate > 0 ? "+" : ""}${d.growthRate.toFixed(1)}%` : NO_DATA}
                        </span>
                      )}
                    </td>
                    <td className="text-right py-1.5 px-2 tabular-nums">
                      <span style={{ color: heatColor(d.ageGroups.elderly, 15, 30, "down") }}>
                        {formatPct(d.ageGroups.elderly)}
                      </span>
                    </td>
                    <td
                      className="text-right py-1.5 px-2 tabular-nums"
                      data-price
                      data-ward={d.region}
                      data-mean={price?.meanPrice ?? ""}
                      data-n={price?.n ?? ""}
                    >
                      {landPending ? (
                        <span style={landPriceStatus === "unavailable" ? { color: "var(--down-text)" } : undefined}>
                          {pendingText(landPriceStatus)}
                        </span>
                      ) : price ? (
                        <>
                          {manPrice(price.meanPrice)}
                          <span className="ml-1 text-[9px] text-muted-foreground">n={price.n}</span>
                        </>
                      ) : (
                        NO_DATA
                      )}
                    </td>
                    <td className="py-1.5 pl-2">
                      <div className="h-1.5 rounded-full" style={{ background: miniBar(d.population, maxPop, "var(--up-ui)") }} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <SourceNote
            source="estat"
            unit="人口 人・密度 人/km²・増減 %・高齢率 %"
            year={vintage ?? undefined}
            note={`${growthFailed ? "人口・密度・高齢率" : "人口・密度・増減・高齢率"}の列: ${SOURCES.estat.label}`}
          />
          <p className="source-note" data-source="land-prices">
            {landPending
              ? `平均価格（${use}）の列: ${pendingText(landPriceStatus)}${landPriceStatus === "unavailable" ? ` — ${SOURCES.ksj.label}` : ""}`
              : `平均価格（${use}）の列: 出典: ${SOURCES.ksj.label}${landProvenance ? ` ／ ${landProvenance}` : ""} ／ ${LAND_PRICE_MEAN_NOTE}（n は地点数）`}
          </p>
        </>
      )}
    </div>
  );
}
