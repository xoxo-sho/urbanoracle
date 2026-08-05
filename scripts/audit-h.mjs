#!/usr/bin/env node
/**
 * H項 audit — design-spec-v1 §8. Structural, zero tolerance.
 *
 *   node scripts/audit-h.mjs [--dir src]
 *
 * The spec lists what UrbanOracle must never look like. Each rule below is one
 * of those items expressed as something a machine can check, so a regression
 * fails the build instead of quietly shipping. This mirrors the Parallel City
 * H項 CI.
 *
 * Findings are reported with file:line so a failure is actionable. The audit
 * scans source (what a reviewer edits); the token layer is the single place
 * colour and radius are defined, so scanning source catches reintroductions.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const dirArg = args.indexOf("--dir");
const SCAN_DIRS = dirArg >= 0 ? [args[dirArg + 1]] : ["src"];
const EXTS = new Set([".ts", ".tsx", ".css", ".js", ".mjs"]);

// Radius ceiling (spec §10(a)): --radius is 0.25rem and the largest step in
// use is --radius-sm. Anything above 8px is a blob, not an atlas plate.
const RADIUS_CEILING_PX = 8;

// How far above a match an `h-audit:` allow-marker may sit.
const MARKER_LOOKBACK = 4;

// Emoji, excluding the arrows/symbols that legitimately appear in copy.
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F0FF}\u{2600}-\u{27BF}\u{FE0F}]/u;

const RULES = [
  {
    id: "glassmorphism",
    why: "H項: glassmorphism / backdrop-filter blur",
    test: (line) => /backdrop-filter|backdropFilter|backdrop-blur|\bglass(-strong)?\b/i.test(line),
  },
  {
    id: "decorative-blur",
    why: "H項: decorative blur filter",
    // drop-shadow/invert are functional; blur() on a decorative layer is not.
    test: (line) => /filter:\s*[^;]*\bblur\(/i.test(line),
  },
  {
    id: "decorative-gradient",
    why: "H項: gradient mesh / decorative gradient (data ramps must be tokens)",
    test: (line, marked) => {
      if (!/linear-gradient|radial-gradient|conic-gradient/i.test(line)) return false;
      // A data bar drawn as a hard two-stop ramp is a chart primitive, not
      // decoration; it is marked explicitly at the call site.
      return !/h-audit:\s*data-ramp/.test(marked);
    },
  },
  {
    id: "emoji",
    why: "H項: emoji in UI copy",
    test: (line) => EMOJI.test(line),
  },
  {
    id: "excessive-radius",
    why: `H項: 過大な角丸 (> ${RADIUS_CEILING_PX}px)`,
    test: (line, marked) => {
      // Tailwind steps above sm resolve past the ceiling with --radius 0.25rem.
      if (/\brounded-(xl|2xl|3xl|4xl)\b/.test(line)) return true;
      const m = line.match(/border-radius:\s*([0-9.]+)(px|rem)/i);
      if (!m) return false;
      if (/h-audit:\s*allow-radius/.test(marked)) return false;
      const px = m[2].toLowerCase() === "rem" ? parseFloat(m[1]) * 16 : parseFloat(m[1]);
      return px > RADIUS_CEILING_PX;
    },
  },
  {
    id: "playful-3d",
    why: "H項: 遊戯的3D / transform perspective",
    test: (line) => /perspective\(|rotate3d\(|rotateX\(|rotateY\(/i.test(line),
  },
];

/**
 * Blank out comments so the audit judges what ships, not prose about it —
 * otherwise a doc comment explaining a banned pattern trips the rule that
 * bans it. Line numbers are preserved so findings stay actionable.
 *
 * Only block comments and whole-line `//` comments are removed; a trailing
 * `//` is left alone because stripping it would corrupt URLs inside strings.
 */
function stripComments(lines) {
  let inBlock = false;
  return lines.map((raw) => {
    let line = raw;
    if (inBlock) {
      const end = line.indexOf("*/");
      if (end === -1) return "";
      line = line.slice(end + 2);
      inBlock = false;
    }
    if (/^\s*\/\//.test(line)) return "";
    for (;;) {
      const start = line.indexOf("/*");
      if (start === -1) break;
      const end = line.indexOf("*/", start + 2);
      if (end === -1) {
        inBlock = true;
        line = line.slice(0, start);
        break;
      }
      line = line.slice(0, start) + " " + line.slice(end + 2);
    }
    return line;
  });
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (EXTS.has(extname(entry))) out.push(full);
  }
  return out;
}

const findings = [];
for (const dir of SCAN_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const rel = file.slice(ROOT.length + 1);
    // A rule's own definition is not a violation of itself.
    if (rel === "scripts/audit-h.mjs") continue;
    const raw = readFileSync(file, "utf8").split("\n");
    const code = stripComments(raw);
    code.forEach((line, i) => {
      if (!line.trim()) return;
      // An allow-marker may sit on the matched line or within the few lines
      // above it, so it can annotate the function or JSX element that owns the
      // pattern rather than being wedged into the middle of an expression.
      const marked = raw.slice(Math.max(0, i - MARKER_LOOKBACK), i + 1).join(" ");
      for (const rule of RULES) {
        if (rule.test(line, marked)) {
          findings.push({ rel, line: i + 1, rule, text: line.trim().slice(0, 100) });
        }
      }
    });
  }
}

if (findings.length === 0) {
  console.log(`H項 audit: clean (${SCAN_DIRS.join(", ")})`);
  process.exit(0);
}

console.error(`H項 audit FAILED — ${findings.length} violation(s):\n`);
for (const f of findings) {
  console.error(`  ${f.rel}:${f.line}  [${f.rule.id}] ${f.rule.why}`);
  console.error(`      ${f.text}`);
}
process.exit(1);
