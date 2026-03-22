"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ZAxis,
  Cell,
} from "recharts";
import type { LandPriceSummary, DemographicsData } from "@/types";
import { TOOLTIP_STYLE, AXIS_STYLE, CURSOR_STYLE, CHART_COLORS } from "@/lib/chart-theme";

interface LandPriceChartProps {
  prices: LandPriceSummary[];
  demographics: DemographicsData[];
}

export default function LandPriceChart({ prices, demographics }: LandPriceChartProps) {
  const sorted = [...prices].sort((a, b) => b.avgPrice - a.avgPrice).slice(0, 10);
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];
  const ratio = top && bottom ? Math.round(top.avgPrice / bottom.avgPrice) : 0;

  const scatterData = prices
    .map((p) => {
      const demo = demographics.find((d) => d.region === p.region);
      if (!demo) return null;
      return { name: p.region.replace("区", ""), x: demo.density, y: p.avgPrice / 10000, z: demo.population };
    })
    .filter(Boolean);

  return (
    <div className="space-y-3">
      {/* Bar: land price ranking — hero */}
      <div className="chart-section">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            区別平均地価
          </h4>
          <span className="text-[10px] text-muted-foreground">
            格差 <span className="text-foreground font-bold">{ratio}倍</span>
            <span className="ml-1">({top?.region.replace("区", "")} vs {bottom?.region.replace("区", "")})</span>
          </span>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={sorted} barCategoryGap="18%">
            <XAxis dataKey="region" {...AXIS_STYLE} tickFormatter={(v) => v.replace("区", "")} />
            <YAxis {...AXIS_STYLE} tick={AXIS_STYLE.tickMuted} width={40}
              tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`}
            />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={CURSOR_STYLE}
              formatter={(v) => typeof v === "number" ? `${(v / 10000).toFixed(1)}万円/m²` : v}
            />
            <Bar dataKey="avgPrice" radius={[3, 3, 0, 0]}>
              {sorted.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS.warning} opacity={1 - i * 0.07} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Scatter: the cross-analysis — this is the real insight */}
      <div className="chart-section">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            密度 vs 地価
          </h4>
          <span className="text-[9px] text-muted-foreground">
            円の大きさ = 人口
          </span>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <ScatterChart>
            <XAxis dataKey="x" type="number" {...AXIS_STYLE} tick={AXIS_STYLE.tickMuted}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            />
            <YAxis dataKey="y" type="number" {...AXIS_STYLE} tick={AXIS_STYLE.tickMuted}
              tickFormatter={(v) => `${v.toFixed(0)}万`} width={40}
            />
            <ZAxis dataKey="z" range={[30, 180]} />
            <Tooltip contentStyle={TOOLTIP_STYLE}
              labelFormatter={(_, p) => p?.[0]?.payload?.name ?? ""}
              formatter={(value, name) => {
                if (name === "x") return [`${Number(value).toLocaleString()}/km²`, "密度"];
                if (name === "y") return [`${value}万/m²`, "地価"];
                return [Number(value).toLocaleString(), "人口"];
              }}
            />
            <Scatter data={scatterData} fill={CHART_COLORS.warning}>
              {scatterData.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS.warning} opacity={0.7} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
