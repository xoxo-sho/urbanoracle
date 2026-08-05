"use client";

import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { WardProfile } from "@/types";
import { CHART_COLORS } from "@/lib/chart-theme";

interface WardRadarProps {
  profiles: WardProfile[];
  selectedWard?: string | null;
}

const AXIS_LABELS: Record<string, string> = {
  population: "人口",
  landPrice: "地価",
  accessibility: "交通",
  safety: "安全性",
  greenRatio: "緑地",
};

const WARD_COLORS = [
  CHART_COLORS.upside,
  CHART_COLORS.downside,
  CHART_COLORS.neutral1,
  CHART_COLORS.neutral2,
  CHART_COLORS.neutral3,
];

export default function WardRadar({ profiles, selectedWard }: WardRadarProps) {
  const axes = ["population", "landPrice", "accessibility", "safety", "greenRatio"] as const;
  const radarData = axes.map((axis) => {
    const row: Record<string, string | number> = { axis: AXIS_LABELS[axis] };
    for (const p of profiles) {
      row[p.region] = p[axis];
    }
    return row;
  });

  return (
    <div className="chart-section">
      <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {selectedWard ? `${selectedWard} vs 23区平均` : "区別総合比較"}
      </h4>
      <ResponsiveContainer width="100%" height={260}>
        <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="65%">
          <PolarGrid stroke="var(--grid-line)" />
          <PolarAngleAxis dataKey="axis" tick={{ fill: "var(--axis-tick)", fontSize: 10 }} />
          <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
          {profiles.map((p, i) => (
            <Radar key={p.region} name={p.region} dataKey={p.region}
              stroke={WARD_COLORS[i % WARD_COLORS.length]}
              fill={WARD_COLORS[i % WARD_COLORS.length]}
              fillOpacity={0.06} strokeWidth={1.5}
            />
          ))}
          <Legend iconSize={6} wrapperStyle={{ fontSize: "9px", color: "var(--muted-foreground)" }} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
