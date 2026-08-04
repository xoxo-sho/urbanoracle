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
import { NO_DATA, averageOf, byValueDesc, formatK, formatMan, formatPct, hasValue } from "@/lib/format";

interface DemographicsChartProps {
  data: DemographicsData[];
  allData: DemographicsData[];
  populationTrends: PopulationTrend[];
  selectedWard: string | null;
}

export default function DemographicsChart({ data, allData, populationTrends, selectedWard }: DemographicsChartProps) {
  const sorted = [...data].sort((a, b) => byValueDesc(a.population, b.population));
  const ward = selectedWard ? sorted[0] : null;

  // Averages for comparison when ward is selected
  const avgPopulation = averageOf(allData.map((d) => d.population));
  const avgDensity = averageOf(allData.map((d) => d.density));
  const avgElderly = averageOf(allData.map((d) => d.ageGroups.elderly));
  const avg = {
    population: hasValue(avgPopulation) ? Math.round(avgPopulation) : null,
    density: hasValue(avgDensity) ? Math.round(avgDensity) : null,
    growthRate: +(allData.reduce((s, d) => s + d.growthRate, 0) / allData.length).toFixed(1),
    elderly: hasValue(avgElderly) ? Math.round(avgElderly) : null,
  };

  // "x% vs the 23-ward average" is only meaningful when both sides exist.
  const diffPct = (value: number | null, average: number | null): string | null =>
    hasValue(value) && hasValue(average) && average !== 0
      ? (((value - average) / average) * 100).toFixed(0)
      : null;
  const subVsAverage = (diff: string | null) =>
    diff === null ? `平均比 ${NO_DATA}` : `平均比 ${Number(diff) > 0 ? "+" : ""}${diff}%`;

  // Ward-specific view
  if (ward && selectedWard) {
    const popDiff = diffPct(ward.population, avg.population);
    const densityDiff = diffPct(ward.density, avg.density);
    return (
      <div className="space-y-3">
        {/* Ward summary cards */}
        <div className="grid grid-cols-4 gap-2">
          <MetricCard label="人口" value={formatMan(ward.population)} sub={subVsAverage(popDiff)} positive={Number(popDiff ?? 0) >= 0} />
          <MetricCard label="密度" value={formatK(ward.density)} sub={subVsAverage(densityDiff)} positive={Number(densityDiff ?? 0) >= 0} />
          <MetricCard label="成長率" value={`${ward.growthRate > 0 ? "+" : ""}${ward.growthRate}%`} sub={`平均 ${avg.growthRate > 0 ? "+" : ""}${avg.growthRate}%`} positive={ward.growthRate >= avg.growthRate} />
          <MetricCard label="高齢率" value={formatPct(ward.ageGroups.elderly)} sub={`平均 ${formatPct(avg.elderly)}`} positive={(ward.ageGroups.elderly ?? 0) <= (avg.elderly ?? 0)} />
        </div>

        {/* Age breakdown */}
        <div className="chart-section">
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            年齢構成 — {selectedWard} vs 23区平均
          </h4>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <AgeBar label={selectedWard} young={ward.ageGroups.young} working={ward.ageGroups.working} elderly={ward.ageGroups.elderly} />
            <AgeBar label="23区平均" young={averageOf(allData.map((d) => d.ageGroups.young))} working={averageOf(allData.map((d) => d.ageGroups.working))} elderly={avg.elderly} />
          </div>
        </div>
      </div>
    );
  }

  // All-area view
  const popTrendData = populationTrends.map((t) => ({ year: t.year, 人口: t.population }));
  const latestPop = popTrendData[popTrendData.length - 1]?.人口 ?? 0;
  const prevPop = popTrendData[popTrendData.length - 2]?.人口 ?? latestPop;
  const recentGrowth = ((latestPop - prevPop) / prevPop * 100).toFixed(1);

  const fastestGrowing = allData.reduce((max, d) => d.growthRate > max.growthRate ? d : max);
  const fastestDeclining = allData.reduce((min, d) => d.growthRate < min.growthRate ? d : min);
  const agedRanked = allData.filter((d) => hasValue(d.ageGroups.elderly));
  const mostAged = agedRanked.length
    ? agedRanked.reduce((max, d) => (d.ageGroups.elderly! > max.ageGroups.elderly! ? d : max))
    : null;

  const ageData = sorted.slice(0, 8).map((d) => ({
    name: d.region.replace("区", ""),
    "0-14歳": d.ageGroups.young,
    "15-64歳": d.ageGroups.working,
    "65歳+": d.ageGroups.elderly,
  }));

  return (
    <div className="space-y-3">
      {popTrendData.length > 0 && (
        <div className="chart-section">
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">人口推移（東京23区）</h4>
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
              <YAxis {...AXIS_STYLE} tick={AXIS_STYLE.tickMuted} width={36} tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} domain={["dataMin - 300000", "dataMax + 200000"]} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => typeof v === "number" ? `${v.toLocaleString()}人` : v} />
              <Area type="monotone" dataKey="人口" stroke={CHART_COLORS.primary} strokeWidth={2} fill="url(#demoPopGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

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
          <div className="text-sm font-bold text-amber-300">{mostAged ? formatPct(mostAged.ageGroups.elderly) : NO_DATA}</div>
          <div className="text-[9px] text-muted-foreground mt-0.5">{mostAged?.region ?? ""}</div>
          <div className="text-[8px] text-amber-400/60">高齢化率1位</div>
        </div>
      </div>

      <div className="chart-section">
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">年齢構成</h4>
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

function MetricCard({ label, value, sub, positive }: { label: string; value: string; sub: string; positive: boolean }) {
  return (
    <div className="chart-section text-center py-3">
      <div className="text-[10px] text-muted-foreground mb-1">{label}</div>
      <div className="text-lg font-bold">{value}</div>
      <div className={`text-[9px] mt-0.5 ${positive ? "text-emerald-400" : "text-red-400"}`}>{sub}</div>
    </div>
  );
}

function AgeBar({
  label,
  young,
  working,
  elderly,
}: {
  label: string;
  young: number | null;
  working: number | null;
  elderly: number | null;
}) {
  // An unpublished share draws no segment at all — a zero-width bar is the
  // honest rendering of "not published", unlike a 0% label.
  const width = (value: number | null) => (hasValue(value) ? `${value}%` : "0%");

  return (
    <div>
      <div className="text-[10px] text-muted-foreground mb-1.5">{label}</div>
      <div className="flex h-3 rounded-full overflow-hidden">
        <div style={{ width: width(young), background: "oklch(0.72 0.12 220)" }} />
        <div style={{ width: width(working), background: "oklch(0.55 0.16 250)" }} />
        <div style={{ width: width(elderly), background: "oklch(0.42 0.12 280)" }} />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[9px] text-muted-foreground">年少{formatPct(young)}</span>
        <span className="text-[9px] text-muted-foreground">生産{formatPct(working)}</span>
        <span className="text-[9px] text-muted-foreground">高齢{formatPct(elderly)}</span>
      </div>
    </div>
  );
}
