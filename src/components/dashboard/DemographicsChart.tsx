"use client";

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { DemographicsData, PopulationTrend } from "@/types";
import { TOOLTIP_STYLE, AXIS_STYLE, CHART_COLORS } from "@/lib/chart-theme";

interface DemographicsChartProps {
  data: DemographicsData[];
  populationTrends: PopulationTrend[];
}

export default function DemographicsChart({ data, populationTrends }: DemographicsChartProps) {
  const sorted = [...data].sort((a, b) => b.population - a.population);

  const popTrendData = populationTrends.map((t) => ({ year: t.year, 人口: t.population }));
  const latestPop = popTrendData[popTrendData.length - 1]?.人口 ?? 0;
  const prevPop = popTrendData[popTrendData.length - 2]?.人口 ?? latestPop;
  const recentGrowth = ((latestPop - prevPop) / prevPop * 100).toFixed(1);

  // Insight: fastest growing vs declining
  const fastestGrowing = sorted.reduce((max, d) => d.growthRate > max.growthRate ? d : max);
  const fastestDeclining = sorted.reduce((min, d) => d.growthRate < min.growthRate ? d : min);
  const avgElderly = Math.round(sorted.reduce((sum, d) => sum + d.ageGroups.elderly, 0) / sorted.length);
  const mostAged = sorted.reduce((max, d) => d.ageGroups.elderly > max.ageGroups.elderly ? d : max);

  const ageData = sorted.slice(0, 8).map((d) => ({
    name: d.region.replace("区", ""),
    "0-14歳": d.ageGroups.young,
    "15-64歳": d.ageGroups.working,
    "65歳+": d.ageGroups.elderly,
  }));

  return (
    <div className="space-y-3">
      {/* Hero: Population trend */}
      <div className="chart-section">
        <div className="flex items-center justify-between mb-1">
          <h4 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            人口推移（東京23区）
          </h4>
          <div className="text-right">
            <span className="text-base font-bold">{(latestPop / 10000).toFixed(0)}</span>
            <span className="text-[10px] text-muted-foreground">万人</span>
            <span className={`ml-1.5 text-[10px] font-medium ${Number(recentGrowth) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {Number(recentGrowth) > 0 ? "+" : ""}{recentGrowth}%
            </span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={130}>
          <AreaChart data={popTrendData}>
            <defs>
              <linearGradient id="demoPopGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_COLORS.primary} stopOpacity={0.2} />
                <stop offset="100%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="year" {...AXIS_STYLE} tick={AXIS_STYLE.tickMuted} />
            <YAxis {...AXIS_STYLE} tick={AXIS_STYLE.tickMuted} width={36}
              tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`}
              domain={["dataMin - 300000", "dataMax + 200000"]}
            />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => typeof v === "number" ? `${v.toLocaleString()}人` : v} />
            <Area type="monotone" dataKey="人口" stroke={CHART_COLORS.primary} strokeWidth={2} fill="url(#demoPopGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Computed insights — not a template card, just text */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-emerald-500/8 border border-emerald-500/15 py-2 px-1">
          <div className="text-sm font-bold text-emerald-300">+{fastestGrowing.growthRate}%</div>
          <div className="text-[9px] text-muted-foreground mt-0.5">{fastestGrowing.region}</div>
          <div className="text-[8px] text-emerald-400/60">最大成長</div>
        </div>
        <div className="rounded-lg bg-red-500/8 border border-red-500/15 py-2 px-1">
          <div className="text-sm font-bold text-red-300">{fastestDeclining.growthRate}%</div>
          <div className="text-[9px] text-muted-foreground mt-0.5">{fastestDeclining.region}</div>
          <div className="text-[8px] text-red-400/60">最大減少</div>
        </div>
        <div className="rounded-lg bg-amber-500/8 border border-amber-500/15 py-2 px-1">
          <div className="text-sm font-bold text-amber-300">{mostAged.ageGroups.elderly}%</div>
          <div className="text-[9px] text-muted-foreground mt-0.5">{mostAged.region}</div>
          <div className="text-[8px] text-amber-400/60">高齢化率1位 (平均{avgElderly}%)</div>
        </div>
      </div>

      {/* Age composition */}
      <div className="chart-section">
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          年齢構成
        </h4>
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={ageData} barCategoryGap="20%" layout="vertical">
            <XAxis type="number" {...AXIS_STYLE} tick={AXIS_STYLE.tickMuted} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
            <YAxis type="category" dataKey="name" {...AXIS_STYLE} width={36} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend iconSize={6} wrapperStyle={{ fontSize: "9px", color: "oklch(0.55 0 0)" }} />
            <Bar dataKey="0-14歳" stackId="a" fill="oklch(0.72 0.12 220)" radius={0} />
            <Bar dataKey="15-64歳" stackId="a" fill="oklch(0.55 0.16 250)" radius={0} />
            <Bar dataKey="65歳+" stackId="a" fill="oklch(0.42 0.12 280)" radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
