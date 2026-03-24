"use client";

import type { DataLayer } from "@/types";

interface MapLegendProps {
  layers: DataLayer[];
}

const LEGEND_CONFIG: Record<string, { label: string; stops: { color: string; label: string }[] }> = {
  "land-price": {
    label: "地価（万円/m²）",
    stops: [
      { color: "#2563eb", label: "30" },
      { color: "#7c3aed", label: "200" },
      { color: "#dc2626", label: "530" },
    ],
  },
  demographics: {
    label: "人口密度（人/km²）",
    stops: [
      { color: "#dbeafe", label: "5k" },
      { color: "#3b82f6", label: "15k" },
      { color: "#1e3a5f", label: "23k" },
    ],
  },
  "disaster-risk": {
    label: "ハザードマップ（実データ）",
    stops: [
      { color: "#ffffb2", label: "浅い" },
      { color: "#fd8d3c", label: "浸水" },
      { color: "#bd0026", label: "深い" },
    ],
  },
  transportation: {
    label: "乗降客数",
    stops: [
      { color: "#6ee7b7", label: "少" },
      { color: "#10b981", label: "多" },
    ],
  },
};

export default function MapLegend({ layers }: MapLegendProps) {
  const activeLayers = layers.filter((l) => l.enabled && LEGEND_CONFIG[l.id]);
  if (activeLayers.length === 0) return null;

  return (
    <div className="absolute bottom-3 left-3 z-10 glass rounded-xl px-3 py-2 space-y-2 max-w-[180px]">
      {activeLayers.map((layer) => {
        const config = LEGEND_CONFIG[layer.id];
        if (!config) return null;
        return (
          <div key={layer.id}>
            <div className="text-[9px] font-medium text-muted-foreground mb-1">{config.label}</div>
            <div className="flex items-center gap-0.5">
              <div
                className="h-2 flex-1 rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${config.stops.map((s) => s.color).join(", ")})`,
                }}
              />
            </div>
            <div className="flex justify-between mt-0.5">
              {config.stops.map((s, i) => (
                <span key={i} className="text-[8px] text-muted-foreground">{s.label}</span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
