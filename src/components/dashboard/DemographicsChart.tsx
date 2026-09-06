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
import SourceNote from "@/components/dashboard/SourceNote";
import SampleNote from "@/components/dashboard/SampleNote";

interface DemographicsChartProps {
  data: DemographicsData[];
  allData: DemographicsData[];
  populationTrends: PopulationTrend[];
  selectedWard: string | null;
  /** Whether `data`/`allData` came from e-Stat. The population trend never does. */
  isLive?: boolean;
}

export default function DemographicsChart({
  data,
  allData,
  populationTrends,
  selectedWard,
  isLive = false,
}: DemographicsChartProps) {
  // The census columns are live or sample as a block; the note follows.
  const censusNote = (unit: string) =>
    isLive ? (
      <SourceNote source="estat" unit={unit} year="2020年国勢調査・2025年速報" />
    ) : (
      <SampleNote note={`単位: ${unit}`} />
    );
  const sorted = [...data].sort((a, b) => byValueDesc(a.population, b.population));
  const ward = selectedWard ? sorted[0] : null;

  // Averages for comparison when ward is selected
  const avgPopulation = averageOf(allData.map((d) => d.population));
  const avgDensity = averageOf(allData.map((d) => d.density));
  const avgElderly = averageOf(allData.map((d) => d.ageGroups.elderly));
  const avg = {
    population: hasValue(avgPopulation) ? Math.round(avgPopulation) : null,
    density: hasValue(avgDensity) ? Math.round(avgDensity) : null,
    growthRate: averageOf(allData.map((d) => d.growthRate)),
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
          <MetricCard label="成長率" value={hasValue(ward.growthRate) ? `${ward.growthRate > 0 ? "+" : ""}${ward.growthRate.toFixed(1)}%` : NO_DATA} sub={hasValue(avg.growthRate) ? `平均 ${avg.growthRate > 0 ? "+" : ""}${avg.growthRate.toFixed(1)}%` : `平均 ${NO_DATA}`} positive={(ward.growthRate ?? 0) >= (avg.growthRate ?? 0)} />
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
          {censusNote("%")}
        </div>
      </div>
    );
  }

  // All-area view
  const popTrendData = populationTrends.map((t) => ({ year: t.year, 人口: t.population }));
  const latestPop = popTrendData[popTrendData.length - 1]?.人口 ?? 0;
  const prevPop = popTrendData[popTrendData.length - 2]?.人口 ?? latestPop;
  const recentGrowth = ((latestPop - prevPop) / prevPop * 100).toFixed(1);

  // Wards with no published rate cannot lead or trail a ranking.
  const ranked = allData.filter((d) => hasValue(d.growthRate));
  const fastestGrowing = ranked.length
    ? ranked.reduce((max, d) => (d.growthRate! > max.growthRate! ? d : max))
    : null;
  const fastestDeclining = ranked.length
    ? ranked.reduce((min, d) => (d.growthRate! < min.growthRate! ? d : min))
    : null;
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
              <span className="ml-1.5 text-[10px] font-medium" style={{ color: Number(recentGrowth) >= 0 ? "var(--up-text)" : "var(--down-text)" }}>
                {Number(recentGrowth) > 0 ? "+" : ""}{recentGrowth}%
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={130}>
            <AreaChart data={popTrendData}>
              <defs>
                <linearGradient id="demoPopGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_COLORS.upside} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={CHART_COLORS.upside} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="year" {...AXIS_STYLE} tick={AXIS_STYLE.tickMuted} />
              <YAxis {...AXIS_STYLE} tick={AXIS_STYLE.tickMuted} width={36} tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} domain={["dataMin - 300000", "dataMax + 200000"]} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => typeof v === "number" ? `${v.toLocaleString()}人` : v} />
              <Area type="monotone" dataKey="人口" stroke={CHART_COLORS.upside} strokeWidth={2} fill="url(#demoPopGrad)" />
            </AreaChart>
          </ResponsiveContainer>
          <SampleNote note="単位: 人" />
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-sm border py-2 px-1" style={{ background: "var(--up-fill)", borderColor: "var(--chart-section-border)" }}>
          <div className="text-sm font-bold tabular-nums" style={{ color: "var(--up-text)" }}>{fastestGrowing ? `${fastestGrowing.growthRate! > 0 ? "+" : ""}${fastestGrowing.growthRate!.toFixed(1)}%` : NO_DATA}</div>
          <div className="text-[9px] text-muted-foreground mt-0.5">{fastestGrowing?.region ?? ""}</div>
          <div className="text-[8px] text-muted-foreground">最大成長</div>
        </div>
        <div className="rounded-sm border py-2 px-1" style={{ background: "var(--down-fill)", borderColor: "var(--chart-section-border)" }}>
          <div className="text-sm font-bold tabular-nums" style={{ color: "var(--down-text)" }}>{fastestDeclining ? `${fastestDeclining.growthRate!.toFixed(1)}%` : NO_DATA}</div>
          <div className="text-[9px] text-muted-foreground mt-0.5">{fastestDeclining?.region ?? ""}</div>
          <div className="text-[8px] text-muted-foreground">最大減少</div>
        </div>
        <div className="rounded-sm border py-2 px-1" style={{ borderColor: "var(--chart-section-border)" }}>
          <div className="text-sm font-bold tabular-nums">{mostAged ? formatPct(mostAged.ageGroups.elderly) : NO_DATA}</div>
          <div className="text-[9px] text-muted-foreground mt-0.5">{mostAged?.region ?? ""}</div>
          <div className="text-[8px] text-muted-foreground">高齢化率1位</div>
        </div>
      </div>
      {censusNote("%")}

      <div className="chart-section">
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">年齢構成</h4>
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={ageData} barCategoryGap="20%" layout="vertical">
            <XAxis type="number" {...AXIS_STYLE} tick={AXIS_STYLE.tickMuted} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
            <YAxis type="category" dataKey="name" {...AXIS_STYLE} width={36} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend iconSize={6} wrapperStyle={{ fontSize: "9px", color: "var(--muted-foreground)" }} />
            <Bar dataKey="0-14歳" stackId="a" fill="var(--chart-5)" radius={0} />
            <Bar dataKey="15-64歳" stackId="a" fill="var(--chart-4)" radius={0} />
            <Bar dataKey="65歳+" stackId="a" fill="var(--chart-3)" radius={0} />
          </BarChart>
        </ResponsiveContainer>
        {censusNote("%")}
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub, positive }: { label: string; value: string; sub: string; positive: boolean }) {
  return (
    <div className="chart-section text-center py-3">
      <div className="text-[10px] text-muted-foreground mb-1">{label}</div>
      <div className="text-lg font-bold">{value}</div>
      <div className="text-[9px] mt-0.5" style={{ color: positive ? "var(--up-text)" : "var(--down-text)" }}>{sub}</div>
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
        <div style={{ width: width(young), background: "var(--chart-5)" }} />
        <div style={{ width: width(working), background: "var(--chart-4)" }} />
        <div style={{ width: width(elderly), background: "var(--chart-3)" }} />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[9px] text-muted-foreground">年少{formatPct(young)}</span>
        <span className="text-[9px] text-muted-foreground">生産{formatPct(working)}</span>
        <span className="text-[9px] text-muted-foreground">高齢{formatPct(elderly)}</span>
      </div>
    </div>
  );
}
