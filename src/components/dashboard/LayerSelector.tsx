"use client";

import type { DataLayer } from "@/types";

interface LayerSelectorProps {
  layers: DataLayer[];
  onToggle: (id: string) => void;
}

export default function LayerSelector({ layers, onToggle }: LayerSelectorProps) {
  return (
    <div className="flex items-center gap-1">
      {layers.map((layer) => (
        <button
          key={layer.id}
          onClick={() => onToggle(layer.id)}
          className="group relative flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs transition-all cursor-pointer hover:bg-accent/50"
          style={{
            backgroundColor: layer.enabled ? `${layer.color}15` : undefined,
          }}
          title={layer.description}
        >
          <span
            className="relative h-2 w-2 rounded-full transition-all"
            style={{
              backgroundColor: layer.enabled ? layer.color : "oklch(0.35 0 0)",
              boxShadow: layer.enabled ? `0 0 8px ${layer.color}60` : "none",
            }}
          >
            {layer.enabled && (
              <span
                className="absolute inset-0 rounded-full animate-ping"
                style={{ backgroundColor: layer.color, opacity: 0.4 }}
              />
            )}
          </span>
          <span
            className="font-medium transition-colors"
            style={{ color: layer.enabled ? "oklch(0.92 0 0)" : "oklch(0.5 0 0)" }}
          >
            {layer.label}
          </span>
        </button>
      ))}
    </div>
  );
}
