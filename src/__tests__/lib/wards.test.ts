import { describe, expect, it } from "vitest";
import { TOKYO_WARDS, TOKYO_WARD_NAMES } from "@/lib/wards";

/**
 * The ward selector's static list (real-data plan PR 1, CHANGE 3): the 23
 * 特別区 in 全国地方公共団体コード order, 13101 千代田区 through 13123 江戸川区.
 */
describe("TOKYO_WARDS — the 23 特別区 in 全国地方公共団体コード order", () => {
  it("has exactly 23 wards with consecutive codes 13101–13123", () => {
    expect(TOKYO_WARDS).toHaveLength(23);
    TOKYO_WARDS.forEach((w, i) => expect(w.code).toBe(String(13101 + i)));
  });

  it("starts with 千代田区 and ends with 江戸川区", () => {
    expect(TOKYO_WARDS[0]).toEqual({ code: "13101", name: "千代田区" });
    expect(TOKYO_WARDS[22]).toEqual({ code: "13123", name: "江戸川区" });
  });

  it("has unique ward names, each ending in 区, in the same order as the codes", () => {
    expect(new Set(TOKYO_WARD_NAMES).size).toBe(23);
    for (const name of TOKYO_WARD_NAMES) expect(name).toMatch(/区$/);
    expect(TOKYO_WARD_NAMES).toEqual(TOKYO_WARDS.map((w) => w.name));
  });
});
