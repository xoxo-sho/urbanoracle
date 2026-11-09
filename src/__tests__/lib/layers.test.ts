import { describe, expect, it } from "vitest";
import * as layers from "@/lib/layers";

/**
 * The layer list is configuration, not data (real-data plan PR 9): it moved
 * here from src/data/sample.ts, the last thing that file held, unchanged —
 * five layers in tab order, 地価 enabled first.
 *
 * RED on main (d1eda4e): the module does not exist.
 */
describe("src/lib/layers.ts", () => {
  it("exports the layer list and nothing else", () => {
    expect(Object.keys(layers)).toEqual(["dataLayers"]);
  });

  it("the five layers, in order, as they were", () => {
    expect(layers.dataLayers).toEqual([
      { id: "land-price", label: "地価", description: "公示地価・基準地価", color: "var(--up-text)", enabled: true },
      { id: "demographics", label: "人口統計", description: "人口・世帯数・年齢構成", color: "var(--ink-3)", enabled: false },
      { id: "disaster-risk", label: "災害リスク", description: "洪水・地震・土砂災害・津波", color: "var(--down-text)", enabled: false },
      { id: "transportation", label: "交通", description: "鉄道・バス路線・乗降客数", color: "var(--ink-4)", enabled: false },
      { id: "zoning", label: "用途地域", description: "用途地域・容積率・建蔽率", color: "var(--ink-5)", enabled: false },
    ]);
  });
});
