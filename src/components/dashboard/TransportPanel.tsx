"use client";

import type { TransportStation } from "@/types";
import { Train, Crown } from "lucide-react";

interface TransportPanelProps {
  stations: TransportStation[];
}

export default function TransportPanel({ stations }: TransportPanelProps) {
  const sorted = [...stations].sort(
    (a, b) => b.dailyPassengers - a.dailyPassengers
  );
  const maxPassengers = sorted[0]?.dailyPassengers ?? 1;

  return (
    <div className="space-y-4">
      {/* Hero stat */}
      <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3">
        <div className="flex items-center gap-2">
          <Crown className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-xs font-medium text-emerald-300">最多乗降客数</span>
        </div>
        <div className="mt-2">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold">{sorted[0]?.name}</span>
            <span className="text-xs text-muted-foreground">
              {(sorted[0]?.dailyPassengers / 10000).toFixed(1)}万人/日
            </span>
          </div>
        </div>
      </div>

      {/* Station list */}
      <div className="space-y-1.5">
        {sorted.map((station, i) => {
          const ratio = station.dailyPassengers / maxPassengers;
          const isFirst = i === 0;

          return (
            <div
              key={station.id}
              className="group relative rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden transition-colors hover:bg-white/[0.04] animate-fade-in-up"
              style={{ animationDelay: `${i * 0.06}s`, opacity: 0 }}
            >
              {/* Background bar */}
              <div
                className="absolute inset-y-0 left-0 bg-emerald-500/8 transition-all"
                style={{ width: `${ratio * 100}%` }}
              />

              <div className="relative flex items-center gap-3 px-3 py-2.5">
                {/* Rank */}
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ${
                    isFirst
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-white/5 text-muted-foreground"
                  }`}
                >
                  {i + 1}
                </span>

                <Train className={`h-3.5 w-3.5 shrink-0 ${isFirst ? "text-emerald-400" : "text-muted-foreground"}`} />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-medium ${isFirst ? "text-foreground" : ""}`}>
                      {station.name}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {(station.dailyPassengers / 10000).toFixed(1)}万
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {station.lines.slice(0, 3).map((line) => (
                      <span
                        key={line}
                        className="rounded-md bg-white/5 px-1.5 py-0.5 text-[9px] text-muted-foreground"
                      >
                        {line}
                      </span>
                    ))}
                    {station.lines.length > 3 && (
                      <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[9px] text-muted-foreground">
                        +{station.lines.length - 3}
                      </span>
                    )}
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
