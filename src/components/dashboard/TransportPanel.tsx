"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Treemap,
} from "recharts";
import type { TransportStation, TransportTrend } from "@/types";
import { TOOLTIP_STYLE, AXIS_STYLE, CHART_COLORS } from "@/lib/chart-theme";
import { byValueDesc, formatMan, hasValue } from "@/lib/format";
import { Train } from "lucide-react";
import SourceNote from "@/components/dashboard/SourceNote";
import SampleNote from "@/components/dashboard/SampleNote";
import { BUNDLED_UNVERIFIED_NOTE } from "@/lib/sources";

interface TransportPanelProps {
  stations: TransportStation[];
  trends: TransportTrend[];
  selectedWard: string | null;
  /** Whether ridership came from ODPT. The ridership trend never does. */
  isLive?: boolean;
}

export default function TransportPanel({ stations, trends, isLive = false }: TransportPanelProps) {
  // Stations without ODPT coverage sort last rather than as zero.
  const sorted = [...stations].sort((a, b) => byValueDesc(a.dailyPassengers, b.dailyPassengers));
  const known = sorted.map((s) => s.dailyPassengers).filter(hasValue);
  const maxPassengers = known.length ? Math.max(...known) : 0;

  // Treemap data: aggregate lines across stations
  const lineMap = new Map<string, number>();
  for (const s of stations) {
    for (const line of s.lines) {
      if (!hasValue(s.dailyPassengers)) continue;
      lineMap.set(line, (lineMap.get(line) ?? 0) + s.dailyPassengers);
    }
  }
  const treemapData = [...lineMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, value]) => ({ name: name.replace("JR", ""), size: value }));

  // Transport trends: pivot to chart format
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
      {/* Station ranking */}
      <div className="space-y-1.5">
        {sorted.map((station, i) => {
          const ratio =
            hasValue(station.dailyPassengers) && maxPassengers > 0
              ? station.dailyPassengers / maxPassengers
              : 0;
          const isFirst = i === 0;
          return (
            <div key={station.id}
              className="group relative rounded-sm border border-border/50 bg-card/30 overflow-hidden transition-colors hover:bg-accent/50 animate-fade-in-up"
              style={{ animationDelay: `${i * 0.06}s`, opacity: 0 }}
            >
              <div className="absolute inset-y-0 left-0" style={{ width: `${ratio * 100}%`, background: "var(--up-fill)" }} />
              <div className="relative flex items-center gap-3 px-3 py-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-[11px] font-bold tabular-nums"
                  style={isFirst
                    ? { background: "var(--up-fill)", color: "var(--up-text)" }
                    : { background: "var(--secondary)", color: "var(--muted-foreground)" }}
                >{i + 1}</span>
                <Train className="h-3.5 w-3.5 shrink-0" style={{ color: isFirst ? "var(--up-text)" : "var(--muted-foreground)" }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{station.name}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">{formatMan(station.dailyPassengers)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {station.lines.slice(0, 3).map((line) => (
                      <span key={line} className="rounded-md bg-secondary px-1.5 py-0.5 text-[9px] text-muted-foreground">{line}</span>
                    ))}
                    {station.lines.length > 3 && (
                      <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[9px] text-muted-foreground">+{station.lines.length - 3}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {isLive ? (
          <SourceNote
            source="odpt"
            unit="乗降客数 人/日"
            note={`駅の位置・路線は${BUNDLED_UNVERIFIED_NOTE}。ODPT 未収録の駅（JR東日本・京王・小田急等）は「データなし」`}
          />
        ) : (
          <SampleNote note="単位: 乗降客数 人/日" />
        )}
      </div>

      {/* Treemap: lines by aggregated passenger volume — unique chart type */}
      <div className="chart-section">
        <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          路線別利用規模
        </h4>
        <ResponsiveContainer width="100%" height={160}>
          <Treemap
            data={treemapData}
            dataKey="size"
            aspectRatio={3}
            stroke="var(--background)"
            content={({ x, y, width, height, name }) => {
              const w = typeof width === "number" ? width : 0;
              const h = typeof height === "number" ? height : 0;
              return (
                <g>
                  <rect x={x} y={y} width={w} height={h} rx={1}
                    fill={CHART_COLORS.upside} fillOpacity={w < 30 || h < 20 ? 0.35 : 0.7}
                  />
                  {w > 50 && h > 25 && (
                    <text x={Number(x) + 6} y={Number(y) + 14} fontSize={10} fill="var(--background)">
                      {typeof name === "string" ? name : ""}
                    </text>
                  )}
                </g>
              );
            }}
          />
        </ResponsiveContainer>
        {isLive ? (
          <SourceNote source="odpt" unit="人/日" note={`路線名は${BUNDLED_UNVERIFIED_NOTE}`} />
        ) : (
          <SampleNote note="単位: 人/日" />
        )}
      </div>

      {/* Transport trends */}
      {trendData.length > 0 && (
        <div className="chart-section">
          <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            乗降客数推移
          </h4>
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
              <YAxis {...AXIS_STYLE} tick={AXIS_STYLE.tickMuted} width={40}
                tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE}
                formatter={(v) => typeof v === "number" ? `${(v / 10000).toFixed(1)}万人/日` : v}
              />
              {trendStations.map((station, i) => (
                <Area key={station} type="monotone" dataKey={station}
                  stroke={trendColors[i % trendColors.length]} strokeWidth={2}
                  fill={`url(#transport-grad-${i})`}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
          <SampleNote note="単位: 人/日" />
        </div>
      )}
    </div>
  );
}
