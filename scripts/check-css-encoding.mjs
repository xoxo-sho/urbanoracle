#!/usr/bin/env node
/**
 * Build-output encoding check — assert that the CSS that actually SHIPS still
 * carries the Japanese local() names as real UTF-8 bytes.
 *
 *   npm run build && node scripts/check-css-encoding.mjs
 *
 * WHY THIS EXISTS
 * ---------------
 * dxa-tokens.css declares @charset "UTF-8" on line 1 and contains
 * local("游ゴシック Medium") / local("メイリオ"). That is a declaration-level
 * fix, and declarations are not what ships: Next/PostCSS/Lightning CSS may
 * hoist, merge or strip @charset, and a serving layer without a charset header
 * would then read the file as Latin-1. The result is mojibake in the local()
 * string and a silently non-matching face — bug #1's shape, with no detector,
 * on exactly the machines (Japanese-locale Windows) we cannot test.
 *
 * So, in the same spirit as the U+25A0 tofu check: verify the artifact, not
 * the source. After the production build, find every emitted CSS file that
 * carries the DXA fallback faces and assert
 *   (a) it decodes as strict UTF-8 (no invalid sequences), and
 *   (b) it contains the literal code points for 游ゴシック Medium and メイリオ —
 *       not U+FFFD replacement characters, not the Latin-1 mojibake of those
 *       bytes, not a lossy re-encoding.
 *
 * WHERE IT LOOKS
 * --------------
 * The app is `output: "export"`, so what ships is out/ (served by FastAPI from
 * STATIC_DIR). That tree is checked first. Exit 2 if no built CSS exists
 * (build first).
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Next 16 / Turbopack emits the export's CSS into _next/static/chunks/*.css
// (verified on this build); the webpack-era static/css is kept as a fallback.
const CANDIDATE_DIRS = [
  join(ROOT, "out", "_next", "static", "chunks"),
  join(ROOT, "out", "_next", "static", "css"),
  join(ROOT, ".next", "static", "chunks"),
];

/** A file must contain this to be "the token CSS" — keeps the check anchored. */
const ANCHOR = "DXA JA Fallback";

/** Literal strings that must survive the build byte-for-byte as UTF-8. */
const REQUIRED_LITERALS = ["游ゴシック Medium", "游ゴシック Regular", "メイリオ"];

/**
 * What the required literals become if the UTF-8 bytes are misread as
 * Latin-1 and re-encoded — the classic double-encoding mojibake. Presence of
 * any of these is a positive detection, not just absence of the good form.
 */
const MOJIBAKE_FORMS = REQUIRED_LITERALS.map((s) =>
  Buffer.from(s, "utf8").toString("latin1"),
);

const dir = CANDIDATE_DIRS.find(
  (d) => existsSync(d) && readdirSync(d).some((f) => f.endsWith(".css")),
);
if (!dir) {
  console.error("check-css-encoding: no built CSS found — run `npm run build` first");
  console.error("  looked in:\n    " + CANDIDATE_DIRS.map((d) => relative(ROOT, d)).join("\n    "));
  process.exit(2);
}

const cssFiles = readdirSync(dir).filter((f) => f.endsWith(".css")).map((f) => join(dir, f));
const strict = new TextDecoder("utf-8", { fatal: true });
const failures = [];
let anchored = 0;

for (const file of cssFiles) {
  const bytes = readFileSync(file);
  const rel = relative(ROOT, file);

  // (a) strict UTF-8. A Shift_JIS or truncated-multibyte file throws here.
  let text;
  try {
    text = strict.decode(bytes);
  } catch (err) {
    // Only files that (loosely) look like ours matter, but an undecodable
    // file cannot be inspected for the anchor, so decode leniently to see.
    const lenient = new TextDecoder("utf-8").decode(bytes);
    if (lenient.includes(ANCHOR)) {
      failures.push(`${rel}: NOT valid UTF-8 — ${err.message}`);
      anchored++;
    }
    continue;
  }
  if (!text.includes(ANCHOR)) continue;
  anchored++;

  // (b) the literals are present, and their broken forms are absent.
  for (const lit of REQUIRED_LITERALS) {
    if (!text.includes(lit)) {
      failures.push(`${rel}: literal ${JSON.stringify(lit)} is missing from the emitted CSS`);
    }
  }
  if (text.includes("�")) {
    failures.push(`${rel}: contains U+FFFD replacement character(s) — lossy re-encoding`);
  }
  for (const [i, bad] of MOJIBAKE_FORMS.entries()) {
    if (text.includes(bad)) {
      failures.push(
        `${rel}: contains Latin-1 mojibake of ${JSON.stringify(REQUIRED_LITERALS[i])} — ` +
          `the file was double-encoded`,
      );
    }
  }
}

if (anchored === 0) {
  console.error(
    `FAIL check-css-encoding — no emitted CSS in ${relative(ROOT, dir)} contains "${ANCHOR}"; ` +
      `the token file did not make it into the build`,
  );
  process.exit(1);
}

if (failures.length > 0) {
  console.error(`FAIL check-css-encoding — ${failures.length} problem(s) in ${relative(ROOT, dir)}`);
  for (const f of failures) console.error("  - " + f);
  console.error(
    "\n  The Japanese local() names must ship as real UTF-8 or the Windows/Legacy\n" +
      "  fallback faces silently match nothing on Japanese-locale Windows.",
  );
  process.exit(1);
}

console.log(
  `OK check-css-encoding — ${anchored} emitted CSS file(s) in ${relative(ROOT, dir)} ` +
    `are strict UTF-8 and carry ${REQUIRED_LITERALS.map((s) => JSON.stringify(s)).join(", ")} literally`,
);
