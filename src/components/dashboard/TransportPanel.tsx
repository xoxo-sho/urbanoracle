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
import { Train } from "lucide-react";

interface TransportPanelProps {
  stations: TransportStation[];
  trends: TransportTrend[];
}

export default function TransportPanel({ stations, trends }: TransportPanelProps) {
  const sorted = [...stations].sort((a, b) => b.dailyPassengers - a.dailyPassengers);
  const maxPassengers = sorted[0]?.dailyPassengers ?? 1;

  // Treemap data: aggregate lines across stations
  const lineMap = new Map<string, number>();
  for (const s of stations) {
    for (const line of s.lines) {
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

  const trendColors = [CHART_COLORS.secondary, CHART_COLORS.primary, CHART_COLORS.warning];

  return (
    <div className="space-y-4">
      {/* Station ranking */}
      <div className="space-y-1.5">
        {sorted.map((station, i) => {
          const ratio = station.dailyPassengers / maxPassengers;
          const isFirst = i === 0;
          return (
            <div key={station.id}
              className="group relative rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden transition-colors hover:bg-white/[0.04] animate-fade-in-up"
              style={{ animationDelay: `${i * 0.06}s`, opacity: 0 }}
            >
              <div className="absolute inset-y-0 left-0 bg-emerald-500/8" style={{ width: `${ratio * 100}%` }} />
              <div className="relative flex items-center gap-3 px-3 py-2.5">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ${
                  isFirst ? "bg-emerald-500/20 text-emerald-300" : "bg-white/5 text-muted-foreground"
                }`}>{i + 1}</span>
                <Train className={`h-3.5 w-3.5 shrink-0 ${isFirst ? "text-emerald-400" : "text-muted-foreground"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{station.name}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">{(station.dailyPassengers / 10000).toFixed(1)}万</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {station.lines.slice(0, 3).map((line) => (
                      <span key={line} className="rounded-md bg-white/5 px-1.5 py-0.5 text-[9px] text-muted-foreground">{line}</span>
                    ))}
                    {station.lines.length > 3 && (
                      <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[9px] text-muted-foreground">+{station.lines.length - 3}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
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
            stroke="oklch(0.11 0.015 265)"
            content={({ x, y, width, height, name }) => {
              const w = typeof width === "number" ? width : 0;
              const h = typeof height === "number" ? height : 0;
              return (
                <g>
                  <rect x={x} y={y} width={w} height={h} rx={4}
                    fill={CHART_COLORS.secondary} fillOpacity={w < 30 || h < 20 ? 0.3 : 0.6}
                  />
                  {w > 50 && h > 25 && (
                    <text x={Number(x) + 6} y={Number(y) + 14} fontSize={10} fill="oklch(0.9 0 0)">
                      {typeof name === "string" ? name : ""}
                    </text>
                  )}
                </g>
              );
            }}
          />
        </ResponsiveContainer>
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
        </div>
      )}
    </div>
  );
}
