"use client";

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { FieldSources, RidershipTrend, TransportStation } from "@/types";
import type { DataStatus } from "@/lib/use-gated-data";
import { TOOLTIP_STYLE, AXIS_STYLE, CHART_COLORS } from "@/lib/chart-theme";
import { NO_DATA, byValueDesc, formatMan, hasValue } from "@/lib/format";
import { Train } from "lucide-react";
import SourceNote from "@/components/dashboard/SourceNote";
import { KsjCredits, S12Notice } from "@/components/dashboard/RequiredCredits";
import { StateNotice, isPending } from "@/components/dashboard/DataState";
import { SOURCES } from "@/lib/sources";
import { RIDERSHIP_DEFINITION_NOTE, RIDERSHIP_JR_NOTE, RIDERSHIP_OPERATORS_TITLE, RIDERSHIP_TREND_UNIT_NOTE } from "@/lib/credits";
import { ridershipSource, ridershipTrendLine } from "@/lib/census-sources";
import { trendChartRows, trendCoverageText, trendShare, trendView, trendYearsLabel } from "@/lib/ridership-trend";

/**
 * 交通 tab: the stations of the selected ward (or of the 23 wards) from the
 * committed 国土数値情報 S12 snapshot (real-data plan PR 4), the sums by the
 * operator S12 writes each row under — their total is the ward's 日間乗降客
 * (Architect decision 13) — and 乗降客数推移, the sum of a fixed panel of S12
 * units over 2018 and 2020–2024 with 2019 left out (real-data plan PR 4b,
 * Architect decisions 2026-11-09).
 *
 * Every year, table and figure named here is read from the payload; a payload
 * that names none gets none claimed for it. Each surface that shows a figure
 * carries S12's own notice on what the operators' figures are.
 */

interface TransportPanelProps {
  /** The stations of the current view: the selected ward's, or all 23 wards'. */
  stations: TransportStation[];
  /** 乗降客数推移 as the /transport answer sends it (its `total.trend`); null when the answer has none. */
  trend: RidershipTrend | null;
  selectedWard: string | null;
  /** State of the /transport answer: every surface of the tab follows it. */
  status: DataStatus;
  /** The payload's `sources`: per field, the 国土数値情報 edition and its year. */
  sources?: FieldSources;
}

/** In the 23-ward view the list is cut to this many; the cut is stated. */
const TOP_N = 20;

export default function TransportPanel({ stations, trend, selectedWard, status, sources }: TransportPanelProps) {
  const ridership = ridershipSource(sources);
  const sourceYear = ridership ? `${ridership.year}年度 国土数値情報 駅別乗降客数データ（${ridership.table}）` : undefined;
  const pendingSource = `駅別乗降客数・駅の位置: ${SOURCES.ksj.label}`;

  // Stations without a figure sort last rather than as zero.
  const sorted = [...stations].sort((a, b) => byValueDesc(a.dailyPassengers, b.dailyPassengers));
  const shown = selectedWard ? sorted : sorted.slice(0, TOP_N);
  const cut = shown.length < sorted.length;
  const known = sorted.map((s) => s.dailyPassengers).filter(hasValue);
  const maxPassengers = known.length ? Math.max(...known) : 0;

  // By the operator S12 writes the row under: each row's figure summed over
  // the stations in view — one figure per station-operator, so the total
  // equals the K3 tile. A row may hold another operator's line (its 備考).
  const operatorMap = new Map<string, number>();
  for (const s of stations) {
    for (const o of s.operators ?? []) {
      if (!hasValue(o.passengers)) continue;
      operatorMap.set(o.name, (operatorMap.get(o.name) ?? 0) + o.passengers);
    }
  }
  const operators = [...operatorMap.entries()].sort((a, b) => b[1] - a[1]);
  const operatorTotal = operators.reduce((sum, [, v]) => sum + v, 0);
  const operatorMax = operators.length ? operators[0][1] : 0;

  return (
    <div className="space-y-4">
      {/* T1: the stations */}
      <div className="space-y-1.5" data-surface="stations">
        {isPending(status) ? (
          <StateNotice status={status} source={pendingSource} />
        ) : (
          <>
            {shown.map((station, i) => {
              const ratio =
                hasValue(station.dailyPassengers) && maxPassengers > 0 ? station.dailyPassengers / maxPassengers : 0;
              const isFirst = i === 0;
              const elsewhere = station.countedElsewhere;
              return (
                <div
                  key={station.id}
                  data-station
                  data-station-id={station.id}
                  data-name={station.name}
                  data-ward={station.ward ?? ""}
                  data-passengers={hasValue(station.dailyPassengers) ? station.dailyPassengers : ""}
                  className="group relative rounded-sm border border-border/50 bg-card/30 overflow-hidden transition-colors hover:bg-accent/50 animate-fade-in-up"
                  style={{ animationDelay: `${i * 0.06}s`, opacity: 0 }}
                >
                  <div className="absolute inset-y-0 left-0" style={{ width: `${ratio * 100}%`, background: "var(--up-fill)" }} />
                  <div className="relative flex items-center gap-3 px-3 py-2.5">
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-[11px] font-bold tabular-nums"
                      style={isFirst ? { background: "var(--up-fill)", color: "var(--up-text)" } : { background: "var(--secondary)", color: "var(--muted-foreground)" }}
                    >
                      {i + 1}
                    </span>
                    <Train className="h-3.5 w-3.5 shrink-0" style={{ color: isFirst ? "var(--up-text)" : "var(--muted-foreground)" }} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-medium">
                          {station.name}
                          {!selectedWard && station.ward ? <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">{station.ward}</span> : null}
                        </span>
                        {/* A station S12 counts on another row says so — データなし is
                            for a figure that does not exist (PR 1), and this one does. */}
                        <span className="text-right text-xs tabular-nums text-muted-foreground">
                          {elsewhere ? <span data-counted-elsewhere>{elsewhere.label}</span> : formatMan(station.dailyPassengers)}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {station.lines.slice(0, 3).map((line) => (
                          <span key={line} className="rounded-md bg-secondary px-1.5 py-0.5 text-[9px] text-muted-foreground">
                            {line}
                          </span>
                        ))}
                        {station.lines.length > 3 && (
                          <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[9px] text-muted-foreground">+{station.lines.length - 3}</span>
                        )}
                      </div>
                      {/* Where the figure is counted, when S12 names the row. */}
                      {station.note ? (
                        <p className="source-note mt-1" {...(elsewhere ? { "data-counted-note": "" } : {})}>
                          {station.note}
                        </p>
                      ) : null}
                      {/* Each figure row's 備考 of the year, as S12 writes it: what else the row's figure contains. */}
                      {(station.remarks ?? []).map((remark) => (
                        <p
                          key={`${remark.operator}-${remark.line}`}
                          className="source-note mt-1"
                          data-remark
                          data-operator={remark.operator}
                          data-line={remark.line}
                          data-text={remark.text}
                        >
                          {remark.operator} {remark.line}の備考：{remark.text}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
            {cut ? (
              <p className="source-note" data-station-count>
                上位{shown.length}駅／全{sorted.length}駅
              </p>
            ) : null}
            <SourceNote source="ksj" unit="乗降客数 人/日" year={sourceYear} note={`${RIDERSHIP_DEFINITION_NOTE}。${RIDERSHIP_JR_NOTE}`} />
            <S12Notice />
            <KsjCredits />
          </>
        )}
      </div>

      {/* T2: by the operator S12 writes the row under — per-operator sums; their total is the K3 tile */}
      <div className="chart-section" data-surface="operators">
        <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{RIDERSHIP_OPERATORS_TITLE}</h4>
        {isPending(status) ? (
          <StateNotice status={status} source={pendingSource} />
        ) : (
          <>
            <ul className="space-y-1.5">
              {operators.map(([name, value]) => (
                <li key={name} data-operator={name} data-passengers={value} className="relative overflow-hidden rounded-sm">
                  <div className="absolute inset-y-0 left-0" style={{ width: `${operatorMax ? (value / operatorMax) * 100 : 0}%`, background: "var(--up-fill)", opacity: 0.7 }} />
                  <div className="relative flex items-center justify-between px-2 py-1 text-xs">
                    <span>{name}</span>
                    <span className="tabular-nums text-muted-foreground">{formatMan(value)}</span>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-2 flex items-center justify-between text-xs font-medium" data-operators-total={operatorTotal}>
              <span>合計（{selectedWard ?? "23区"}）</span>
              <span className="tabular-nums">{formatMan(operatorTotal)}</span>
            </p>
            <SourceNote source="ksj" unit="人/日" year={sourceYear} note={RIDERSHIP_DEFINITION_NOTE} />
            <S12Notice />
          </>
        )}
      </div>

      {/* T3: 乗降客数推移 — the panel's sum for the view (real-data plan PR 4b) */}
      <RidershipTrendSection trend={trend} selectedWard={selectedWard} status={status} sources={sources} pendingSource={pendingSource} />
    </div>
  );
}

/**
 * T3 乗降客数推移: for the selected ward — 東京23区 when none — the sum of the
 * panel's units, year by year, as S12 publishes the values. A year the
 * series leaves out is a break in the line with its reason beneath, never an
 * interpolated point. Under the chart: how much of the view the panel holds
 * and why the sum is not the 日間乗降客 tile.
 */
function RidershipTrendSection({
  trend,
  selectedWard,
  status,
  sources,
  pendingSource,
}: {
  trend: RidershipTrend | null;
  selectedWard: string | null;
  status: DataStatus;
  sources?: FieldSources;
  pendingSource: string;
}) {
  const view = isPending(status) ? null : trendView(trend, selectedWard);
  const title = "乗降客数推移";

  if (isPending(status) || !view || !trend) {
    return (
      <div className="chart-section" data-surface="ridership-trend">
        <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{title}</h4>
        {isPending(status) ? (
          <StateNotice status={status} source={pendingSource} />
        ) : (
          // The answer arrived and holds no trend for this view: nothing to draw, nothing invented.
          <p className="text-xs text-muted-foreground">{NO_DATA}</p>
        )}
      </div>
    );
  }

  const rows = trendChartRows(view);
  const drawn = new Set(view.series.map((p) => p.year));
  const gapYears = rows.filter((r) => !drawn.has(r.year)).map((r) => r.year);
  const reasons = new Map((trend.gaps ?? []).map((g) => [g.year, g.text]));
  const share = trendShare(view);
  const yearsLabel = trendYearsLabel(view.series.map((p) => p.year));

  return (
    <div className="chart-section" data-surface="ridership-trend" data-view={view.name}>
      <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {title}（{view.name}）
      </h4>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={rows}>
          <defs>
            <linearGradient id="ridership-trend-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS.upside} stopOpacity={0.2} />
              <stop offset="95%" stopColor={CHART_COLORS.upside} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="year" {...AXIS_STYLE} tick={AXIS_STYLE.tickMuted} />
          <YAxis {...AXIS_STYLE} tick={AXIS_STYLE.tickMuted} width={44} tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => (typeof v === "number" ? `${v.toLocaleString()}人/日` : v)} />
          {/* connectNulls off: the line stops at a year left out and starts again after it. */}
          <Area
            type="linear"
            dataKey="passengers"
            name="パネル合計"
            stroke={CHART_COLORS.upside}
            strokeWidth={2}
            fill="url(#ridership-trend-grad)"
            connectNulls={false}
            dot={{ r: 3, fill: CHART_COLORS.upside, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
      {/* The points as text, for assistive technology and for the guards: the
          chart itself is an SVG a screen reader cannot read. A year left out
          is listed as left out, with no value. */}
      <ul className="sr-only" data-trend-points>
        {rows.map((row) =>
          row.passengers === null ? (
            <li key={row.year} data-trend-gap data-year={row.year}>
              {row.year}年度 表示なし
            </li>
          ) : (
            <li key={row.year} data-trend-point data-year={row.year} data-passengers={row.passengers}>
              {row.year}年度 {row.passengers.toLocaleString()}人/日
            </li>
          )
        )}
      </ul>
      {gapYears.map((year) => (
        <p key={year} className="source-note mt-2" data-trend-gap-reason data-year={year}>
          {reasons.get(year) ?? `${year}年度は表示しません`}
        </p>
      ))}
      <p className="source-note mt-1" data-trend-coverage data-panel-units={view.panelUnits} data-units={view.units} data-share={share ?? ""}>
        {trendCoverageText(view)}
        <span className="block">{RIDERSHIP_TREND_UNIT_NOTE}</span>
      </p>
      <SourceNote source="ksj" unit="人/日（1日平均）" year={ridershipTrendLine(sources, yearsLabel)} />
      <S12Notice />
    </div>
  );
}
