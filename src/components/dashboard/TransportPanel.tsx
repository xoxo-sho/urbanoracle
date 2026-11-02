"use client";

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { FieldSources, TransportStation, TransportTrend } from "@/types";
import type { DataStatus } from "@/lib/use-gated-data";
import { TOOLTIP_STYLE, AXIS_STYLE, CHART_COLORS } from "@/lib/chart-theme";
import { byValueDesc, formatMan, hasValue } from "@/lib/format";
import { Train } from "lucide-react";
import SourceNote from "@/components/dashboard/SourceNote";
import { KsjCredits } from "@/components/dashboard/RequiredCredits";
import SampleNote from "@/components/dashboard/SampleNote";
import { StateNotice, isPending } from "@/components/dashboard/DataState";
import { SOURCES } from "@/lib/sources";
import { RIDERSHIP_DEFINITION_NOTE, RIDERSHIP_JR_NOTE } from "@/lib/credits";
import { ridershipSource } from "@/lib/census-sources";

/**
 * 交通 tab (real-data plan PR 4): the stations of the selected ward (or of the
 * 23 wards) from the committed 国土数値情報 S12 snapshot, the 事業者別 sums whose
 * total is the ward's 日間乗降客 (Architect decision 13), and — still the sample
 * set, out of PR 4 — the 乗降客数推移 chart.
 *
 * Every year and table named here is read from the payload's `sources`; a
 * payload that names none gets no year claimed for it.
 */

interface TransportPanelProps {
  /** The stations of the current view: the selected ward's, or all 23 wards'. */
  stations: TransportStation[];
  trends: TransportTrend[];
  selectedWard: string | null;
  /** State of the /transport answer. The ridership trend (sample) never depends on it. */
  status: DataStatus;
  /** The payload's `sources`: per field, the 国土数値情報 edition and its year. */
  sources?: FieldSources;
}

/** In the 23-ward view the list is cut to this many; the cut is stated. */
const TOP_N = 20;

export default function TransportPanel({ stations, trends, selectedWard, status, sources }: TransportPanelProps) {
  const ridership = ridershipSource(sources);
  const sourceYear = ridership ? `${ridership.year}年度 国土数値情報 駅別乗降客数データ（${ridership.table}）` : undefined;
  const pendingSource = `駅別乗降客数・駅の位置: ${SOURCES.ksj.label}`;

  // Stations without a figure sort last rather than as zero.
  const sorted = [...stations].sort((a, b) => byValueDesc(a.dailyPassengers, b.dailyPassengers));
  const shown = selectedWard ? sorted : sorted.slice(0, TOP_N);
  const cut = shown.length < sorted.length;
  const known = sorted.map((s) => s.dailyPassengers).filter(hasValue);
  const maxPassengers = known.length ? Math.max(...known) : 0;

  // 事業者別: each operator's own figure summed over the stations in view —
  // one figure per station-operator, so the total equals the K3 tile.
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

  // Transport trends (sample): pivot to chart format
  const trendStations = [...new Set(trends.map((t) => t.station))];
  const trendYears = [...new Set(trends.map((t) => t.year))].sort();
  const trendData = trendYears.map((year) => {
    const row: Record<string, number> = { year };
    for (const station of trendStations) {
      const entry = trends.find((t) => t.year === year && t.station === station);
      row[station] = entry ? entry.passengers : 0;
    }
    return row;
  });

  const trendColors = [CHART_COLORS.upside, CHART_COLORS.neutral1, CHART_COLORS.neutral2];

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
              return (
                <div
                  key={station.id}
                  data-station
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
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">
                          {station.name}
                          {!selectedWard && station.ward ? <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">{station.ward}</span> : null}
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground">{formatMan(station.dailyPassengers)}</span>
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
                      {station.note ? <p className="source-note mt-1">{station.note}</p> : null}
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
            <KsjCredits />
          </>
        )}
      </div>

      {/* T2: 事業者別 — per-operator sums; their total is the K3 tile */}
      <div className="chart-section" data-surface="operators">
        <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">事業者別</h4>
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
          </>
        )}
      </div>

      {/* T3: 乗降客数推移 — still the sample set (real-data plan row 4b) */}
      {trendData.length > 0 && (
        <div className="chart-section" data-surface="ridership-trend">
          <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">乗降客数推移</h4>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={trendData}>
              <defs>
                {trendStations.map((station, i) => (
                  <linearGradient key={station} id={`transport-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={trendColors[i % trendColors.length]} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={trendColors[i % trendColors.length]} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <XAxis dataKey="year" {...AXIS_STYLE} tick={AXIS_STYLE.tickMuted} />
              <YAxis {...AXIS_STYLE} tick={AXIS_STYLE.tickMuted} width={40} tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => (typeof v === "number" ? `${(v / 10000).toFixed(1)}万人/日` : v)} />
              {trendStations.map((station, i) => (
                <Area key={station} type="monotone" dataKey={station} stroke={trendColors[i % trendColors.length]} strokeWidth={2} fill={`url(#transport-grad-${i})`} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
          <SampleNote note="単位: 人/日" />
        </div>
      )}
    </div>
  );
}
