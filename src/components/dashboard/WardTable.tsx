"use client";

import type { DemographicsData, LandPriceSummary } from "@/types";
import { NO_DATA, byValueDesc, formatK, formatMan, formatPct, hasValue } from "@/lib/format";

interface WardTableProps {
  demographics: DemographicsData[];
  landPrices: LandPriceSummary[];
  onSelectWard: (ward: string) => void;
}

function heatColor(value: number | null, min: number, max: number, hue: number): string {
  if (!hasValue(value)) return "var(--muted-foreground)";
  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
  const lightness = 0.25 + ratio * 0.45;
  return `oklch(${lightness} 0.15 ${hue})`;
}

function miniBar(value: number | null, max: number, color: string): string {
  if (!hasValue(value) || max <= 0) return "transparent";
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return `linear-gradient(90deg, ${color} ${pct}%, transparent ${pct}%)`;
}

export default function WardTable({ demographics, landPrices, onSelectWard }: WardTableProps) {
  const sorted = [...demographics].sort((a, b) => byValueDesc(a.population, b.population)).slice(0, 12);
  const populations = sorted.map((d) => d.population).filter(hasValue);
  const maxPop = populations.length ? Math.max(...populations) : 0;
  const prices = new Map(landPrices.map((p) => [p.region, p]));

  return (
    <div className="chart-section overflow-x-auto">
      <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        区別データテーブル
      </h4>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-muted-foreground border-b border-border/50">
            <th className="text-left py-1.5 pr-2 font-medium">区</th>
            <th className="text-right py-1.5 px-2 font-medium">人口</th>
            <th className="text-right py-1.5 px-2 font-medium">密度</th>
            <th className="text-right py-1.5 px-2 font-medium">増減</th>
            <th className="text-right py-1.5 px-2 font-medium">高齢率</th>
            <th className="text-right py-1.5 px-2 font-medium">地価</th>
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
                  <span style={{ color: heatColor(d.density, 5000, 24000, 250) }}>
                    {formatK(d.density)}
                  </span>
                </td>
                <td className="text-right py-1.5 px-2 tabular-nums">
                  <span className={d.growthRate >= 0 ? "text-emerald-400" : "text-red-400"}>
                    {d.growthRate > 0 ? "+" : ""}{d.growthRate}%
                  </span>
                </td>
                <td className="text-right py-1.5 px-2 tabular-nums">
                  <span style={{ color: heatColor(d.ageGroups.elderly, 15, 30, 30) }}>
                    {formatPct(d.ageGroups.elderly)}
                  </span>
                </td>
                <td className="text-right py-1.5 px-2 tabular-nums">
                  {price ? `${(price.avgPrice / 10000).toFixed(0)}万` : NO_DATA}
                </td>
                <td className="py-1.5 pl-2">
                  <div className="h-1.5 rounded-full" style={{ background: miniBar(d.population, maxPop, "oklch(0.55 0.12 250)") }} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
