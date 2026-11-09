import type { DataLayer } from "@/types";

export const dataLayers: DataLayer[] = [
  { id: "land-price", label: "地価", description: "公示地価・基準地価", color: "var(--up-text)", enabled: true },
  { id: "demographics", label: "人口統計", description: "人口・世帯数・年齢構成", color: "var(--ink-3)", enabled: false },
  { id: "disaster-risk", label: "災害リスク", description: "洪水・地震・土砂災害・津波", color: "var(--down-text)", enabled: false },
  { id: "transportation", label: "交通", description: "鉄道・バス路線・乗降客数", color: "var(--ink-4)", enabled: false },
  { id: "zoning", label: "用途地域", description: "用途地域・容積率・建蔽率", color: "var(--ink-5)", enabled: false },
];

// No sample set is left here: the last one, 乗降客数推移, became the S12 panel
// with real-data plan PR 4b. `dataLayers` is the layer list, not data; moving
// it and deleting this file is PR 9.
