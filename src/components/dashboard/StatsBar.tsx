"use client";

import { MapPin, Users, AlertTriangle, TrainFront } from "lucide-react";

const stats = [
  { value: "5", unit: "地点", icon: MapPin, color: "text-red-400", glow: "shadow-red-500/20" },
  { value: "8", unit: "区", icon: Users, color: "text-blue-400", glow: "shadow-blue-500/20" },
  { value: "5", unit: "件", icon: AlertTriangle, color: "text-amber-400", glow: "shadow-amber-500/20" },
  { value: "5", unit: "駅", icon: TrainFront, color: "text-emerald-400", glow: "shadow-emerald-500/20" },
] as const;

export default function StatsBar() {
  return (
    <div className="glass-strong flex items-center gap-1 rounded-2xl p-1.5 shadow-lg shadow-black/20">
      {stats.map((stat, i) => (
        <div
          key={i}
          className={`flex items-center gap-2 rounded-xl px-3 py-2 transition-colors hover:bg-white/5 animate-count-up`}
          style={{ animationDelay: `${i * 0.08}s`, opacity: 0 }}
        >
          <stat.icon className={`h-3.5 w-3.5 ${stat.color}`} />
          <span className="text-sm font-bold tabular-nums">{stat.value}</span>
          <span className="text-[10px] text-muted-foreground">{stat.unit}</span>
        </div>
      ))}
    </div>
  );
}
