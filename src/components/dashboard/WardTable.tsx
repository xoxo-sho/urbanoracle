"use client";

import type { DemographicsData, LandPriceSummary } from "@/types";
import { NO_DATA, byValueDesc, formatK, formatMan, formatPct, hasValue } from "@/lib/format";

interface WardTableProps {
  demographics: DemographicsData[];
  landPrices: LandPriceSummary[];
  onSelectWard: (ward: string) => void;
}

// Intensity within one semantic axis: stronger value -> stronger step of the
// same hue. Two hues would imply a distinction the data does not make.
function heatColor(value: number | null, min: number, max: number, axis: "up" | "down"): string {
  if (!hasValue(value)) return "var(--muted-foreground)";
  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
  if (ratio > 0.66) return `var(--${axis}-text)`;
  if (ratio > 0.33) return `var(--${axis}-strong)`;
  return "var(--muted-foreground)";
}

// h-audit: data-ramp — a hard two-stop fill boundary IS the bar, not decoration.
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
                  <span style={{ color: heatColor(d.density, 5000, 24000, "up") }}>
                    {formatK(d.density)}
                  </span>
                </td>
                <td className="text-right py-1.5 px-2 tabular-nums">
                  <span style={{ color: d.growthRate >= 0 ? "var(--up-text)" : "var(--down-text)" }}>
                    {d.growthRate > 0 ? "+" : ""}{d.growthRate}%
                  </span>
                </td>
                <td className="text-right py-1.5 px-2 tabular-nums">
                  <span style={{ color: heatColor(d.ageGroups.elderly, 15, 30, "down") }}>
                    {formatPct(d.ageGroups.elderly)}
                  </span>
                </td>
                <td className="text-right py-1.5 px-2 tabular-nums">
                  {price ? `${(price.avgPrice / 10000).toFixed(0)}万` : NO_DATA}
                </td>
                <td className="py-1.5 pl-2">
                  <div className="h-1.5 rounded-full" style={{ background: miniBar(d.population, maxPop, "var(--up-ui)") }} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
