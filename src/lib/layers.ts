import type { DataLayer } from "@/types";

/**
 * The dashboard's layers, in tab order: which data category each one shows,
 * its label and colour, and which is on first. Configuration, not data — the
 * figures every layer draws come from the gated endpoints (src/lib/use-gated-data.ts).
 */
export const dataLayers: DataLayer[] = [
  { id: "land-price", label: "地価", description: "公示地価・基準地価", color: "var(--up-text)", enabled: true },
  { id: "demographics", label: "人口統計", description: "人口・世帯数・年齢構成", color: "var(--ink-3)", enabled: false },
  { id: "disaster-risk", label: "災害リスク", description: "洪水・地震・土砂災害・津波", color: "var(--down-text)", enabled: false },
  { id: "transportation", label: "交通", description: "鉄道・バス路線・乗降客数", color: "var(--ink-4)", enabled: false },
  { id: "zoning", label: "用途地域", description: "用途地域・容積率・建蔽率", color: "var(--ink-5)", enabled: false },
];
