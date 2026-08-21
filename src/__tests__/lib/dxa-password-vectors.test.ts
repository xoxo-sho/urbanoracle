import { describe, expect, it } from "vitest";
import { checkPassword, isPasswordAcceptable } from "@/app/dxa/dxa-password";
import { PASSWORD_SPEC_VECTORS } from "@/app/dxa/dxa-password.vectors";

/** The platform specification, executed on this surface (dxa-ui v0.3.0). */
describe("dxa-password specification vectors", () => {
  for (const v of PASSWORD_SPEC_VECTORS) {
    it(`${JSON.stringify(v.input)} -> ${v.expect}`, () => {
      expect(isPasswordAcceptable(v.input)).toBe(v.expect === "accept");
      if (v.expect === "reject") {
        expect(checkPassword(v.input).filter((c) => !c.passed).map((c) => c.id)).toContain(v.rule);
      }
    });
  }
  it("Kelvin vector is U+212A (identity guard)", () => {
    expect([...PASSWORD_SPEC_VECTORS.find((v) => v.why.includes("U+212A"))!.input][0].codePointAt(0)).toBe(0x212a);
  });
  it("dotted-I vector is U+0130 (identity guard)", () => {
    expect([...PASSWORD_SPEC_VECTORS.find((v) => v.why.includes("U+0130"))!.input][0].codePointAt(0)).toBe(0x0130);
  });
});
