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
          className="group relative flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs transition-all cursor-pointer hover:bg-accent/50"
          style={{
            backgroundColor: layer.enabled ? `color-mix(in oklch, ${layer.color} 12%, transparent)` : undefined,
          }}
          title={layer.description}
        >
          <span
            className="relative h-2 w-2 rounded-full transition-all"
            style={{
              backgroundColor: layer.enabled ? layer.color : "var(--muted-foreground)",
              boxShadow: "none",
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
            style={{ color: layer.enabled ? "var(--foreground)" : "var(--muted-foreground)" }}
          >
            {layer.label}
          </span>
        </button>
      ))}
    </div>
  );
}
