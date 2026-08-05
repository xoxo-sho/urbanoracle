import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAP_COLORS } from "@/lib/palette";

/**
 * The measured-contrast gate (design-spec-v1 §9).
 *
 * DXA gates on measured AA, not on intent, so the ratios are recomputed here
 * from the tokens themselves. A palette edit that drops a text colour below
 * 4.5:1 fails the build rather than shipping an unreadable panel.
 */

const CSS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

function tokensFor(scope: ":root" | ".dark"): Record<string, string> {
  // Grab the first declaration block for the scope.
  const start = CSS.indexOf(`${scope} {`);
  expect(start).toBeGreaterThan(-1);
  const block = CSS.slice(start, CSS.indexOf("\n}", start));
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/(--[\w-]+):\s*(#[0-9A-Fa-f]{6})/g)) {
    out[m[1]] = m[2];
  }
  return out;
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const channels = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Tokens that carry text, and therefore must clear WCAG AA. */
const TEXT_TOKENS = [
  "--foreground",
  "--muted-foreground",
  "--axis-tick",
  "--axis-tick-muted",
  "--up-text",
  "--up-strong",
  "--down-text",
  "--down-strong",
  "--chart-3",
  "--chart-4",
];

describe("Palette — measured contrast gate", () => {
  for (const [mode, scope] of [
    ["light", ":root"],
    ["dark", ".dark"],
  ] as const) {
    describe(mode, () => {
      const tokens = tokensFor(scope);
      const bg = tokens["--background"];

      it("defines a background", () => {
        expect(bg).toMatch(/^#[0-9A-Fa-f]{6}$/);
      });

      for (const token of TEXT_TOKENS) {
        it(`${token} clears AA 4.5:1 on the ${mode} ground`, () => {
          const value = tokens[token];
          expect(value, `${token} missing from ${scope}`).toBeTruthy();
          expect(contrast(value, bg)).toBeGreaterThanOrEqual(4.5);
        });
      }

      it("the axis pair is contrast-matched (neither side dominates)", () => {
        // A symmetric upside/downside axis must read with equal weight; the
        // spec solved these as matched pairs, so a large gap means drift.
        const up = contrast(tokens["--up-text"], bg);
        const down = contrast(tokens["--down-text"], bg);
        expect(Math.abs(up - down)).toBeLessThan(2.5);
      });
    });
  }

  it("MAP_COLORS mirrors the CSS axis tokens exactly", () => {
    // MapLibre cannot read CSS variables, so the literals are duplicated.
    // This is the check that keeps the duplicate honest.
    const light = tokensFor(":root");
    const dark = tokensFor(".dark");
    expect(MAP_COLORS.light.upText.toUpperCase()).toBe(light["--up-text"].toUpperCase());
    expect(MAP_COLORS.light.downText.toUpperCase()).toBe(light["--down-text"].toUpperCase());
    expect(MAP_COLORS.dark.upText.toUpperCase()).toBe(dark["--up-text"].toUpperCase());
    expect(MAP_COLORS.dark.downText.toUpperCase()).toBe(dark["--down-text"].toUpperCase());
  });
});
