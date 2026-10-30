"use client";

import { MapPin, X } from "lucide-react";

interface WardSelectorProps {
  /**
   * Ward names in the order to offer them. The page passes the 23 特別区 in
   * 全国地方公共団体コード order (src/lib/wards.ts): reference facts, present in
   * every data state, never derived from an endpoint's answer.
   */
  wards: readonly string[];
  selectedWard: string | null;
  onSelect: (ward: string | null) => void;
}

export default function WardSelector({
  wards,
  selectedWard,
  onSelect,
}: WardSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <select
        value={selectedWard ?? ""}
        onChange={(e) => onSelect(e.target.value || null)}
        className="h-8 rounded-lg bg-secondary/50 border border-border/50 px-2 pr-7 text-xs font-medium text-foreground cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23999%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px] bg-[right_6px_center] bg-no-repeat focus:outline-none focus:ring-2 focus:ring-ring/30"
      >
        <option value="">全エリア（23区）</option>
        {wards.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      {selectedWard && (
        <button
          onClick={() => onSelect(null)}
          className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-accent/50 cursor-pointer transition-colors"
          title="全エリアに戻す"
        >
          <X className="h-3 w-3 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}
