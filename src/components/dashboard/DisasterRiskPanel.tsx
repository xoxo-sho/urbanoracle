"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import type { DisasterRisk, FieldSources, ZoningComposition } from "@/types";
import type { DataStatus } from "@/lib/use-gated-data";
import { SOURCES } from "@/lib/sources";
import { zoningLine } from "@/lib/census-sources";
import { designatedLine, formatShare, topTypes, typeStyle } from "@/lib/zoning";
import { StateNotice, isPending } from "@/components/dashboard/DataState";
import { NO_DATA } from "@/lib/format";
import { TOOLTIP_STYLE } from "@/lib/chart-theme";
import { AXIS, NEUTRAL, riskStep } from "@/lib/palette";
import { AlertTriangle, Droplets, Mountain, Waves } from "lucide-react";
import SampleNote from "@/components/dashboard/SampleNote";

const riskIcons = { flood: Droplets, earthquake: AlertTriangle, landslide: Mountain, tsunami: Waves };
const riskLabels: Record<string, string> = { flood: "洪水", earthquake: "地震", landslide: "土砂災害", tsunami: "津波" };
// Hazard type is a category, not a magnitude: neutral ink steps, with the
// single downside hue reserved for severity below.
const riskColors: Record<string, string> = {
  flood: NEUTRAL[1], earthquake: AXIS.down.text,
  landslide: NEUTRAL[2], tsunami: NEUTRAL[3],
};



interface DisasterRiskPanelProps {
  risks: DisasterRisk[];
  /** The 用途地域 composition in view (real-data plan PR 6): the selected ward's, or the 23区's; null while pending. */
  zoning: ZoningComposition | null;
  /** State of the /zoning answer. */
  zoningStatus: DataStatus;
  /** The /zoning payload's `sources`: the 国土数値情報 edition and tables. */
  zoningSources?: FieldSources;
  selectedWard: string | null;
}

/** The mini-bar's legend lists this many types by share; the rest are counted. */
const LEGEND_N = 5;

export default function DisasterRiskPanel({ risks, zoning, zoningStatus, zoningSources = {}, selectedWard }: DisasterRiskPanelProps) {
  // Pie: risk type distribution
  const riskByType = risks.reduce<Record<string, number>>((acc, r) => {
    acc[r.type] = (acc[r.type] ?? 0) + 1;
    return acc;
  }, {});
  const pieData = Object.entries(riskByType).map(([type, count]) => ({
    name: riskLabels[type] ?? type, value: count, color: riskColors[type] ?? "#666",
  }));

  // 用途地域 (D2, real-data plan PR 6): the same composition and metric as the
  // 用途地域 tab — shares of the ward's designated area — drawn as a stacked
  // bar with the largest types in the legend. No sample path: pending states
  // say so and name the source.
  const zoningPending = isPending(zoningStatus);
  const zoningProvenance = zoningLine(zoningSources);
  const legendTypes = zoning ? topTypes(zoning, LEGEND_N) : [];

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
              <Legend iconSize={6} wrapperStyle={{ fontSize: "10px", color: "var(--muted-foreground)" }} />
            </PieChart>
          </ResponsiveContainer>
          <SampleNote note="単位: 件" />
        </div>

        {/* 用途地域 (D2) — stacked horizontal bar from the A55-24 snapshot, not a chart library component */}
        <div className="chart-section" data-surface="disaster-zoning">
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            用途地域
          </h4>
          {zoningPending ? (
            <StateNotice status={zoningStatus} source={`用途地域: ${SOURCES.ksj.label}`} />
          ) : zoning === null ? (
            <p className="state-note">{NO_DATA}</p>
          ) : (
            <>
              <div className="flex h-4 rounded-full overflow-hidden mt-3" data-zoning-bar>
                {zoning.types.map((t, i) => (
                  <div
                    key={t.code}
                    data-zoning-segment
                    data-code={t.code}
                    data-share={t.share}
                    style={{ width: `${t.share}%`, ...typeStyle(i) }}
                    title={`${t.name}: ${formatShare(t.share)}`}
                  />
                ))}
              </div>
              <div className="mt-3 space-y-1">
                {legendTypes.map((t) => (
                  <div key={t.code} className="flex items-center gap-2" data-zoning-type data-code={t.code} data-name={t.name} data-share={t.share} data-m2={t.m2}>
                    <span className="h-2 w-2 rounded-full shrink-0" style={typeStyle(zoning.types.indexOf(t))} />
                    <span className="text-[10px] text-muted-foreground truncate flex-1">{t.name}</span>
                    <span className="text-[10px] tabular-nums text-foreground">{formatShare(t.share)}</span>
                  </div>
                ))}
                {zoning.types.length > LEGEND_N && (
                  <span className="text-[9px] text-muted-foreground">他 {zoning.types.length - LEGEND_N} 区分</span>
                )}
              </div>
              <p className="mt-2 text-[10px] text-foreground" data-designated data-share-of-ward={zoning.designatedShare}>
                {designatedLine(zoning, selectedWard)}
              </p>
              <p className="text-[10px] text-muted-foreground" data-as-of data-as-of-date={zoning.asOf.date ?? ""}>
                {zoning.asOf.text}
              </p>
              <p className="source-note mt-2">
                {`出典: ${SOURCES.ksj.label}`}
                {zoningProvenance ? ` ／ ${zoningProvenance}` : ""}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Risk list */}
      <div className="space-y-2">
        {risks
          .sort((a, b) => b.level - a.level)
          .map((risk, i) => {
            const Icon = riskIcons[risk.type];
            const step = riskStep(risk.level);
            return (
              <div key={risk.id}
                className="group rounded-sm border border-border/50 bg-card/30 p-3 transition-colors hover:bg-accent/50 animate-fade-in-up"
                style={{ animationDelay: `${i * 0.05}s`, opacity: 0 }}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm" style={{ background: step.fill }}>
                    <Icon className="h-4 w-4" style={{ color: step.text }} />
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
                            className="h-1 w-4 rounded-full"
                            style={{ background: level <= risk.level ? step.bar : "var(--secondary)" }}
                          />
                        ))}
                      </div>
                      <span className="text-[10px] font-bold" style={{ color: step.text }}>Lv.{risk.level}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
      </div>
      <SampleNote note="想定災害規模 Lv.1–5" />
    </div>
  );
}
