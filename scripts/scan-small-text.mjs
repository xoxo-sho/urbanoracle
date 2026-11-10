#!/usr/bin/env node
/**
 * Every text size below 11px in the source (follow-up 2, 2026-11-10).
 *
 *   node scripts/scan-small-text.mjs          # list them; exit 1 if any
 *   node scripts/scan-small-text.mjs --json   # the same, as JSON
 *
 * The floor: labels and captions are 12px (Tailwind's text-xs, the scale's
 * caption step), provenance lines are .source-note (11px), and nothing is
 * smaller. src/__tests__/typography/no-small-text.test.ts runs this on every
 * `npm test`; e2e/app-ui.spec.ts checks the rendered pages.
 *
 * What counts as a text size, wherever it is written in src/ or styles/:
 *   - Tailwind arbitrary sizes: text-[9px], text-[0.6rem], text-[length:10px]
 *   - JS style objects and props: fontSize: 10, fontSize: "9px", fontSize={9}
 *   - CSS and inline HTML strings: font-size: 10px / 0.6rem / 0.6em,
 *     and the shrinking keywords (smaller, x-small, xx-small)
 *   - MapLibre symbol layers: "text-size": 10 (drawn on the canvas, so no
 *     DOM check can see it)
 *   - <small>, <sub>, <sup>: the browser draws them smaller than their parent
 * rem and em are counted at 16px.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const FLOOR_PX = 11;

const ROOTS = ["src", "styles"];
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".css"]);
const SKIP_DIRS = new Set(["__tests__", "node_modules"]);

const toPx = (value, unit) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (!unit || unit === "px") return n;
  if (unit === "rem" || unit === "em") return n * 16;
  return null;
};

/** [pattern, kind, (match) => px | "keyword"] — each applied to every line. */
const RULES = [
  [/\btext-\[(?:length:)?(\d*\.?\d+)(px|rem|em)\]/g, "tailwind", (m) => toPx(m[1], m[2])],
  [/\bfontSize\s*[:=]\s*\{?\s*["'`]?(\d*\.?\d+)(px|rem|em)?["'`]?/g, "style", (m) => toPx(m[1], m[2])],
  [/font-size\s*:\s*(\d*\.?\d+)(px|rem|em)/g, "css", (m) => toPx(m[1], m[2])],
  [/font-size\s*:\s*(smaller|x-small|xx-small)\b/g, "css", () => "keyword"],
  [/["']text-size["']\s*:\s*(\d*\.?\d+)/g, "maplibre", (m) => toPx(m[1], "px")],
  [/<(small|sub|sup)[\s>]/g, "element", () => "keyword"],
];

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(path.join(dir, entry.name));
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      yield path.join(dir, entry.name);
    }
  }
}

/**
 * Every size below the floor.
 * @param {string} repoRoot
 * @returns {{ file: string, line: number, kind: string, px: number | string, text: string }[]}
 */
export function scanSmallText(repoRoot) {
  const findings = [];
  for (const root of ROOTS) {
    const abs = path.join(repoRoot, root);
    if (!fs.existsSync(abs)) continue;
    for (const file of walk(abs)) {
      const lines = fs.readFileSync(file, "utf8").split("\n");
      lines.forEach((text, i) => {
        for (const [pattern, kind, measure] of RULES) {
          for (const m of text.matchAll(pattern)) {
            const px = measure(m);
            if (px === "keyword" || (typeof px === "number" && px < FLOOR_PX)) {
              findings.push({
                file: path.relative(repoRoot, file),
                line: i + 1,
                kind,
                px: px === "keyword" ? m[1] : px,
                text: text.trim(),
              });
            }
          }
        }
      });
    }
  }
  return findings;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const findings = scanSmallText(repoRoot);
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(findings, null, 2));
  } else {
    for (const f of findings) console.log(`${f.file}:${f.line}\t${f.px}${typeof f.px === "number" ? "px" : ""}\t${f.kind}\t${f.text.slice(0, 160)}`);
    console.log(`${findings.length} text size(s) below ${FLOOR_PX}px`);
  }
  process.exit(findings.length > 0 ? 1 : 0);
}
