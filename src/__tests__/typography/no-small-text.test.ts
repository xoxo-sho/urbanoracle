import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
// Plain .mjs scanner shared with the command line (node scripts/scan-small-text.mjs).
import { FLOOR_PX, scanSmallText } from "../../../scripts/scan-small-text.mjs";

/**
 * Follow-up 2 (2026-11-10): no text below 11px anywhere in the source.
 *
 * Labels and captions are 12px (Tailwind's text-xs, the scale's caption
 * step); provenance lines are .source-note (11px, globals.css); nothing is
 * smaller. The 成長率1位 caption (9px) and the 人口推移 header's 万人 and growth
 * figure (10px) were the ones logged as unreadable (RECON §9). The rendered
 * pages are checked in a browser by e2e/app-ui.spec.ts.
 */

const ROOT = resolve(__dirname, "../../..");

describe("text sizes in the source", () => {
  it("the floor is 11px", () => {
    expect(FLOOR_PX).toBe(11);
  });

  it("no text size below 11px is written anywhere in src/ or styles/", () => {
    const found = scanSmallText(ROOT).map((f) => `${f.file}:${f.line} ${f.px}${typeof f.px === "number" ? "px" : ""} (${f.kind})`);
    expect(found, `${found.length} text size(s) below 11px:\n${found.join("\n")}`).toEqual([]);
  });

  it("the scanner sees every way a size is written (so an empty result means something)", async () => {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "small-text-"));
    mkdirSync(join(dir, "src"));
    writeFileSync(
      join(dir, "src", "a.tsx"),
      [
        '<span className="text-[9px]">a</span>',
        '<span className="text-[0.6rem]">b</span>',
        "<Legend wrapperStyle={{ fontSize: \"9px\" }} />",
        "const AXIS = { fontSize: 10 };",
        "<text fontSize={8}>c</text>",
        '"text-size": 10,',
        "`<div style=\"font-size:10px\">d</div>`",
        "<small>e</small>",
        // At or above the floor: none of these may be reported.
        '<span className="text-[11px] text-xs">f</span>',
        "const OK = { fontSize: 12 };",
        '"text-size": 12,',
      ].join("\n")
    );
    writeFileSync(join(dir, "src", "b.css"), ".x { font-size: 10px; }\n.y { font-size: x-small; }\n.z { font-size: 11px; }\n");
    const lines = scanSmallText(dir).map((f) => `${f.file}:${f.line}`);
    expect(lines).toEqual([
      "src/a.tsx:1",
      "src/a.tsx:2",
      "src/a.tsx:3",
      "src/a.tsx:4",
      "src/a.tsx:5",
      "src/a.tsx:6",
      "src/a.tsx:7",
      "src/a.tsx:8",
      "src/b.css:1",
      "src/b.css:2",
    ]);
  });
});
