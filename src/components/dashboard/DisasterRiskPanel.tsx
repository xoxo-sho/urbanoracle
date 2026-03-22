"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import type { DisasterRisk, ZoningArea } from "@/types";
import { TOOLTIP_STYLE, CHART_COLORS } from "@/lib/chart-theme";
import { AlertTriangle, Droplets, Mountain, Waves } from "lucide-react";

const riskIcons = { flood: Droplets, earthquake: AlertTriangle, landslide: Mountain, tsunami: Waves };
const riskLabels: Record<string, string> = { flood: "洪水", earthquake: "地震", landslide: "土砂災害", tsunami: "津波" };
const riskColors: Record<string, string> = {
  flood: CHART_COLORS.primary, earthquake: CHART_COLORS.warning,
  landslide: CHART_COLORS.secondary, tsunami: CHART_COLORS.purple,
};

const levelConfig: Record<number, { bg: string; text: string; bar: string }> = {
  1: { bg: "bg-emerald-500/10", text: "text-emerald-300", bar: "bg-emerald-500" },
  2: { bg: "bg-yellow-500/10", text: "text-yellow-300", bar: "bg-yellow-500" },
  3: { bg: "bg-orange-500/10", text: "text-orange-300", bar: "bg-orange-500" },
  4: { bg: "bg-red-500/10", text: "text-red-300", bar: "bg-red-500" },
  5: { bg: "bg-red-600/15", text: "text-red-200", bar: "bg-red-600" },
};

interface DisasterRiskPanelProps {
  risks: DisasterRisk[];
  zoning: ZoningArea[];
}

export default function DisasterRiskPanel({ risks, zoning }: DisasterRiskPanelProps) {
  // Pie: risk type distribution
  const riskByType = risks.reduce<Record<string, number>>((acc, r) => {
    acc[r.type] = (acc[r.type] ?? 0) + 1;
    return acc;
  }, {});
  const pieData = Object.entries(riskByType).map(([type, count]) => ({
    name: riskLabels[type] ?? type, value: count, color: riskColors[type] ?? "#666",
  }));

  // Zoning: horizontal stacked bar (unique — not pie or radial)
  const totalZoning = zoning.reduce((sum, z) => sum + z.areaPct, 0);

  return (
    <div className="space-y-4">
      {/* Two-column: Pie + Zoning bar side by side */}
      <div className="grid grid-cols-2 gap-3">
        {/* Pie chart */}
        <div className="chart-section">
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            災害種別
          </h4>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={35} outerRadius={60}
                paddingAngle={4} dataKey="value" stroke="none"
              >
                {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend iconSize={6} wrapperStyle={{ fontSize: "10px", color: "oklch(0.6 0 0)" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Zoning — stacked horizontal bar, not a chart library component */}
        <div className="chart-section">
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            用途地域
          </h4>
          {/* Stacked bar */}
          <div className="flex h-4 rounded-full overflow-hidden mt-3">
            {zoning.map((z) => (
              <div key={z.id} style={{ width: `${(z.areaPct / totalZoning) * 100}%`, background: z.color }}
                title={`${z.label}: ${z.areaPct}%`}
              />
            ))}
          </div>
          {/* Legend */}
          <div className="mt-3 space-y-1">
            {zoning.slice(0, 5).map((z) => (
              <div key={z.id} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: z.color }} />
                <span className="text-[10px] text-muted-foreground truncate flex-1">
                  {z.label.replace("第一種", "一種").replace("専用", "")}
                </span>
                <span className="text-[10px] tabular-nums text-foreground">{z.areaPct}%</span>
              </div>
            ))}
            {zoning.length > 5 && (
              <span className="text-[9px] text-muted-foreground">+{zoning.length - 5} more</span>
            )}
          </div>
        </div>
      </div>

      {/* Risk list */}
      <div className="space-y-2">
        {risks
          .sort((a, b) => b.level - a.level)
          .map((risk, i) => {
            const Icon = riskIcons[risk.type];
            const config = levelConfig[risk.level];
            return (
              <div key={risk.id}
                className="group rounded-xl border border-border/50 bg-card/30 p-3 transition-colors hover:bg-accent/50 animate-fade-in-up"
                style={{ animationDelay: `${i * 0.05}s`, opacity: 0 }}
              >
                <div className="flex items-start gap-3">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${config.bg}`}>
                    <Icon className={`h-4 w-4 ${config.text}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{risk.region}</span>
                      <span className="text-[10px] text-muted-foreground">{riskLabels[risk.type]}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{risk.description}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((level) => (
                          <div key={level}
                            className={`h-1 w-4 rounded-full ${level <= risk.level ? config.bar : "bg-secondary"}`}
                            style={{ opacity: level <= risk.level ? 0.8 : 0.3 }}
                          />
                        ))}
                      </div>
                      <span className={`text-[10px] font-bold ${config.text}`}>Lv.{risk.level}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
