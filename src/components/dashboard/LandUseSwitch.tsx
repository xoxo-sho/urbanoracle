"use client";

import { LAND_USES, LAND_USE_LABEL, type LandUse } from "@/lib/land-price";
import { cn } from "@/lib/utils";

/**
 * The 住宅地 / 商業地 switch of the 地価 surfaces (real-data plan PR 5). One
 * control, held by the page, so the bar, the scatter, the table column and the
 * choropleth always show the same use; 住宅地 by default.
 */
export default function LandUseSwitch({ value, onChange }: { value: LandUse; onChange: (use: LandUse) => void }) {
  return (
    <div data-land-use-switch role="group" aria-label="用途区分" className="flex items-center gap-1">
      <span className="mr-1 text-[10px] text-muted-foreground">用途区分</span>
      {LAND_USES.map((use) => (
        <button
          key={use}
          type="button"
          data-land-use={use}
          aria-pressed={value === use}
          onClick={() => onChange(use)}
          className={cn(
            "rounded-sm px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
            value === use ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-accent/50"
          )}
        >
          {LAND_USE_LABEL[use]}
        </button>
      ))}
    </div>
  );
}
