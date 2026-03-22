"use client";

import type { DisasterRisk } from "@/types";
import { AlertTriangle, Droplets, Mountain, Waves, ShieldAlert } from "lucide-react";

const riskIcons = {
  flood: Droplets,
  earthquake: AlertTriangle,
  landslide: Mountain,
  tsunami: Waves,
};

const riskLabels = {
  flood: "洪水",
  earthquake: "地震",
  landslide: "土砂災害",
  tsunami: "津波",
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
}

export default function DisasterRiskPanel({ risks }: DisasterRiskPanelProps) {
  const highRiskCount = risks.filter((r) => r.level >= 4).length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
          <span className="text-xs font-medium text-amber-300">高リスク地域</span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-bold">{highRiskCount}</span>
          <span className="text-xs text-muted-foreground">/ {risks.length} 地域</span>
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
              <div
                key={risk.id}
                className="group rounded-xl border border-white/5 bg-white/[0.02] p-3 transition-colors hover:bg-white/[0.04] animate-fade-in-up"
                style={{ animationDelay: `${i * 0.05}s`, opacity: 0 }}
              >
                <div className="flex items-start gap-3">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${config.bg}`}>
                    <Icon className={`h-4 w-4 ${config.text}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{risk.region}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground">
                          {riskLabels[risk.type]}
                        </span>
                      </div>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                      {risk.description}
                    </p>
                    {/* Risk level bar */}
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((level) => (
                          <div
                            key={level}
                            className={`h-1 w-4 rounded-full transition-all ${
                              level <= risk.level ? config.bar : "bg-white/5"
                            }`}
                            style={{
                              opacity: level <= risk.level ? 0.8 : 0.3,
                            }}
                          />
                        ))}
                      </div>
                      <span className={`text-[10px] font-bold ${config.text}`}>
                        Lv.{risk.level}
                      </span>
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
