"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";
import type { DemographicsData } from "@/types";
import { TrendingUp, TrendingDown } from "lucide-react";

interface DemographicsChartProps {
  data: DemographicsData[];
}

const tooltipStyle = {
  background: "oklch(0.14 0.012 265 / 95%)",
  border: "1px solid oklch(1 0 0 / 10%)",
  borderRadius: "12px",
  color: "oklch(0.95 0 0)",
  fontSize: "12px",
  padding: "8px 12px",
  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
};

export default function DemographicsChart({ data }: DemographicsChartProps) {
  const sorted = [...data].sort((a, b) => b.population - a.population);
  const populationData = sorted.map((d) => ({
    name: d.region.replace("区", ""),
    人口: d.population,
    growthRate: d.growthRate,
  }));

  const ageData = sorted.slice(0, 6).map((d) => ({
    name: d.region.replace("区", ""),
    "年少": d.ageGroups.young,
    "生産": d.ageGroups.working,
    "高齢": d.ageGroups.elderly,
  }));

  // Highlight top by population
  const maxPop = sorted[0]?.population ?? 0;

  return (
    <div className="space-y-4">
      {/* Key insight card */}
      <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 p-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-3.5 w-3.5 text-blue-400" />
          <span className="text-xs font-medium text-blue-300">人口増加率トップ</span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-lg font-bold">
            {sorted.reduce((max, d) => d.growthRate > max.growthRate ? d : max).region}
          </span>
          <span className="text-xs text-muted-foreground">
            +{sorted.reduce((max, d) => d.growthRate > max.growthRate ? d : max).growthRate}%
          </span>
        </div>
      </div>

      {/* Population chart */}
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            区別人口
          </h4>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={populationData} barCategoryGap="25%">
            <XAxis
              dataKey="name"
              fontSize={10}
              tick={{ fill: "oklch(0.5 0 0)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              fontSize={10}
              tick={{ fill: "oklch(0.4 0 0)" }}
              tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            <Tooltip
              formatter={(value) =>
                typeof value === "number" ? value.toLocaleString() + "人" : value
              }
              contentStyle={tooltipStyle}
              cursor={{ fill: "oklch(1 0 0 / 3%)" }}
            />
            <Bar dataKey="人口" radius={[4, 4, 0, 0]}>
              {populationData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.人口 === maxPop ? "oklch(0.72 0.19 250)" : "oklch(0.55 0.12 250)"}
                  opacity={entry.人口 === maxPop ? 1 : 0.6}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Growth rates — inline sparkline style */}
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
        <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          人口増減率
        </h4>
        <div className="space-y-2">
          {sorted.map((d) => (
            <div key={d.region} className="flex items-center gap-3">
              <span className="w-14 text-xs text-muted-foreground truncate">
                {d.region.replace("区", "")}
              </span>
              <div className="relative flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-all"
                  style={{
                    width: `${Math.min(Math.abs(d.growthRate) * 20, 100)}%`,
                    background: d.growthRate >= 0
                      ? "oklch(0.7 0.17 160)"
                      : "oklch(0.7 0.18 25)",
                  }}
                />
              </div>
              <div className="flex items-center gap-1 w-14 justify-end">
                {d.growthRate >= 0 ? (
                  <TrendingUp className="h-3 w-3 text-emerald-400" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-red-400" />
                )}
                <span className={`text-xs font-medium tabular-nums ${d.growthRate >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {d.growthRate > 0 ? "+" : ""}{d.growthRate}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Age composition */}
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
        <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          年齢構成
        </h4>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={ageData} barCategoryGap="20%" layout="vertical">
            <XAxis
              type="number"
              fontSize={10}
              tick={{ fill: "oklch(0.4 0 0)" }}
              axisLine={false}
              tickLine={false}
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
            />
            <YAxis
              type="category"
              dataKey="name"
              fontSize={10}
              tick={{ fill: "oklch(0.5 0 0)" }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend
              iconSize={8}
              wrapperStyle={{ fontSize: "10px", color: "oklch(0.6 0 0)" }}
            />
            <Bar dataKey="年少" stackId="a" fill="oklch(0.75 0.12 220)" radius={0} />
            <Bar dataKey="生産" stackId="a" fill="oklch(0.58 0.16 250)" radius={0} />
            <Bar dataKey="高齢" stackId="a" fill="oklch(0.45 0.12 280)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
