#!/usr/bin/env node
/**
 * CHECK 1 (static) — no Japanese text may be rendered through a font stack
 * that has no CJK face in its chain.
 *
 *   node scripts/check-font-cjk.mjs                       # from the repo root
 *   DXA_CHECK_VERBOSE=1 node scripts/check-font-cjk.mjs   # list every declaration
 *
 * Exit 0 = clean. Exit 1 = at least one offending declaration. Exit 2 = usage.
 *
 * THE STATED LIMIT (dxa-ui docs §5a): a chain check decides whether a stack
 * NAMES a CJK face; only the metrics test (e2e/font-metrics.spec.ts) decides
 * what an element DRAWS through. This surface is the cautionary case: its
 * body chain was `var(--font-geist-sans)` — resolving to `Geist, "Geist
 * Fallback"` — with 621 Japanese characters going through it on the LP. A
 * chain check that only followed var() one hop would see a next/font
 * variable it cannot resolve and must NOT pass it on that account; the
 * bridge's --dxa-face-ja is the only variable recognised as a CJK face by
 * name (--font-noto-sans-jp, which lives on <html> as a class, not in CSS).
 *
 * WHAT IT DOES (UrbanOracle = Next 16 static export + Tailwind v4 @theme inline)
 * --------------------------------------------------------------------------
 * Scans src/ (.ts/.tsx/.css). Stylesheets always; TS/TSX only when they carry
 * Japanese. Recognises font-family / fontFamily declarations, Tailwind v4
 * `--font-*` @theme keys (each IS a stack — the .font-<name> utility; with
 * `@theme inline` the key is the ONLY place the stack exists in source, since
 * no runtime variable is emitted), canvas `font:` shorthand strings and
 * resolveFontSans()/Mono() aliases (uniform no-ops here). Resolves var()
 * through the token file and bridge; fails on a CJK-less chain, on a consumed
 * token with an incomplete bridge, and on token-file lint (RULE A/B).
 *
 * --font-heading is the product's own serif display stack (Source Serif +
 * Zen Old Mincho heading subsets + serif): it names a JA face and is checked
 * like any other key — no exception list on this surface.
 *
 * EXCLUDED, WITH REASON
 * ---------------------
 * src/app/opengraph-image.tsx — next/og (Satori) build-time render, not a
 * browser stack (production OG PNG renders its Japanese; Satori fetches Noto
 * for CJK dynamically).
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Vendored by dxa-ui/scripts/sync.mjs alongside the tokens; covered by the
// drift check on both surfaces (identical bytes — the manifests carry the
// same sourceHash), so importing frontend's copy is importing lp's.
import { lintTokenCss } from "./dxa-token-lint.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const SURFACES = [
  {
    name: "urbanoracle (Next 16 static export, Tailwind v4 @theme inline)",
    root: REPO,
    scanDirs: ["src"],
    extraFiles: [],
    tokenFile: join("src", "app", "dxa", "dxa-tokens.css"),
    exclude: [join("src", "app", "opengraph-image.tsx")],
  },
];

/** No Latin-only theme-key exceptions on this surface. */
const LATIN_ONLY_THEME_KEYS = new Set([]);

const EXTS = new Set([".ts", ".tsx", ".css"]);
const SKIP_DIRS = new Set(["node_modules", ".next", "out", "public", "__tests__"]);

/** Hiragana, katakana, CJK unified ideographs (incl. JIS level 2). */
const JA_RE = /[぀-ゟ゠-ヿ一-鿿]/;

/**
 * Strip comments before looking for Japanese. A file whose only JA is in a
 * comment renders no Japanese and must not be flagged. `//` is only treated
 * as a comment when it is not part of a URL scheme.
 */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * Same, but line-preserving: block comments are replaced by the newlines they
 * spanned, so declarations are matched on comment-free text while failure
 * line numbers still point at the real line. Without this a comment that
 * *mentions* a stack (e.g. "Preflight's `html { font-family:
 * var(--default-font-family) }`") is scanned as if it were one.
 */
function stripCommentsKeepLines(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ""))
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * Faces with Japanese coverage. Matched case-insensitively as substrings of a
 * single stack entry. `system-ui` is deliberately ABSENT: it resolves to a
 * CJK-capable face on macOS and Windows-JA but not dependably elsewhere, and
 * treating it as sufficient is exactly the assumption that produced this bug
 * (and, on this app, the assumption the old @theme --font-sans made).
 * `--font-noto-jp` is the LP's next/font variable for Noto Sans JP
 * (lp/src/app/layout.tsx); it lives on <html> as a class, not in any CSS file,
 * so it can never be resolved by the var() expander and is recognised by name.
 */
const CJK_FACES = [
  "noto sans jp",
  "noto sans cjk",
  "hiragino",
  "yu gothic",
  "yugothic",
  "meiryo",
  "ms pgothic",
  "ms gothic",
  "osaka",
  "dxa ja fallback",
  "--dxa-face-ja",
  // next/font variables that ARE Japanese faces (live on <html> as classes,
  // unresolvable by the var() expander, recognised by name):
  "--font-noto-sans-jp",   // the body JA face added by the dxa-ui work
  "--font-zen-old-mincho", // the heading JA face (local subset)
  "zen old mincho",
  "zenoldmincho",
];

const BRIDGE_VARS = ["--dxa-face-latin", "--dxa-face-ja", "--dxa-face-mono"];

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e)) continue;
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (EXTS.has(extname(p))) out.push(p);
  }
  return out;
}

/**
 * JS-side token consumers → their CSS token, so the CSS resolver below can
 * treat `resolveFontMono()` and `${TOOLTIP_MONO}` as var(--dxa-font-mono).
 */
function tokenAliases(text) {
  const aliases = new Map();
  const re = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*resolveFont(Sans|Mono)\s*\(/g;
  let m;
  while ((m = re.exec(text)) !== null) aliases.set(m[1], m[2].toLowerCase());
  return aliases;
}

function substituteJsTokens(line, aliases) {
  return line
    .replace(/resolveFont(Sans|Mono)\s*\(\s*\)/g, (_, k) => `var(--dxa-font-${k.toLowerCase()})`)
    .replace(/\$\{\s*([A-Za-z_$][\w$]*)\s*\}/g, (whole, id) =>
      aliases.has(id) ? `var(--dxa-font-${aliases.get(id)})` : whole,
    );
}

function hasCjk(chain) {
  const lower = chain.toLowerCase();
  return CJK_FACES.some((f) => lower.includes(f));
}

const allFailures = [];
const summary = [];

for (const surface of SURFACES) {
  const files = [
    ...surface.scanDirs.flatMap((d) => walk(join(surface.root, d))),
    ...surface.extraFiles.map((f) => join(surface.root, f)).filter(existsSync),
  ].filter((f) => !surface.exclude.some((x) => f === join(surface.root, x)));

  /** Every --custom-property defined anywhere in this surface's scanned CSS. */
  const varDefs = new Map();
  for (const f of files) {
    const text = stripComments(readFileSync(f, "utf8"));
    const re = /(--[a-z0-9-]+)\s*:\s*([^;}]+)[;}]/gi;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (!varDefs.has(m[1])) varDefs.set(m[1], m[2].trim());
    }
  }

  /** Expand var() references, depth-limited so a cycle cannot hang the check. */
  function resolveChain(value, depth = 0) {
    if (depth > 8) return value;
    let changed = false;
    const out = value.replace(
      /var\(\s*(--[a-z0-9-]+)\s*(?:,([^)]*))?\)/gi,
      (whole, name, fallback) => {
        if (varDefs.has(name)) {
          changed = true;
          return varDefs.get(name);
        }
        if (fallback !== undefined) {
          changed = true;
          return fallback.trim();
        }
        return whole; // unresolved — reported separately below
      },
    );
    return changed ? resolveChain(out, depth + 1) : out;
  }

  const failures = [];
  let consumesDxaToken = false;
  let declarationsChecked = 0;

  for (const f of files) {
    const raw = readFileSync(f, "utf8");
    // CSS files are ALWAYS scanned (inherited stacks); TS/TSX/HTML only when
    // they contain Japanese outside comments — an inline style on an element
    // renders that element's text, not text elsewhere.
    const isCss = extname(f) === ".css";
    if (!isCss && !JA_RE.test(stripComments(raw))) continue;

    const rel = relative(REPO, f);
    const aliases = isCss ? new Map() : tokenAliases(raw);
    // Declarations are matched on comment-free, line-preserving text so a
    // stack quoted inside a comment is not scanned, and line numbers hold.
    const lines = stripCommentsKeepLines(raw).split("\n");

    lines.forEach((rawLine, i) => {
      const line = substituteJsTokens(rawLine, aliases);

      const decls = [
        ...line.matchAll(/font-family\s*:\s*([^;{}]+)/gi),
        ...line.matchAll(/fontFamily\s*:\s*["'`]([^"'`]+)["'`]/g),
        ...line.matchAll(/fontFamily\s*:\s*(var\([^)]*\))/g),
        // Tailwind v4 theme keys ARE stacks: every `--font-<name>` inside
        // @theme generates a `.font-<name>` utility whose font-family is this
        // value, and Preflight's html rule reads --font-sans. Neither the
        // utility nor the html rule exists in source, so the only place the
        // stack can be checked is the key itself. Found by fault injection on
        // this app: reverting @theme --font-mono to the old JetBrains stack
        // (no JA face) passed this check and was caught only by the metrics
        // test. Stylesheets only; --font-* in TS/TSX is not a Tailwind key.
        ...(isCss ? line.matchAll(/(?:^|[\s;{])(--font-[a-z0-9-]+)\s*:\s*([^;{}]+)/gi) : []),
        // Canvas font shorthand as a string (Cesium LabelGraphics.font,
        // ctx.font): "bold 13px sans-serif" / `bold 13px ${X}`. Group 1 is a
        // marker so the family part can be split off below.
        ...(!isCss ? line.matchAll(/(?<![-\w])(font)\s*:\s*["'`]([^"'`]+)["'`]/g) : []),
      ];
      if (decls.length === 0) return;

      for (const d of decls) {
        const isThemeKey = d[2] !== undefined && /^--font-/.test(d[1]);
        const isCanvasShorthand = d[2] !== undefined && d[1] === "font";
        // A template-literal style attribute ends the value at the closing
        // quote of the attribute; strip anything from a quote-then-`>` on.
        let declared = (isThemeKey || isCanvasShorthand ? d[2] : d[1])
          .replace(/["'`]\s*>.*$/, "")
          .trim()
          .replace(/["'`]$/, "")
          .replace(/,$/, "");
        if (isCanvasShorthand) {
          // Strip everything up to and including the size (and line-height):
          // "bold 13px sans-serif" -> "sans-serif"; "italic 700 12px/1.2 X" -> "X".
          declared = declared.replace(/^.*?\d+(?:\.\d+)?(?:px|pt|em|rem|%)(?:\/[^\s]+)?\s+/, "");
        }
        // Skip @font-face family *names* — those declare a face, not a stack.
        if (/^["']?DXA JA Fallback/i.test(declared)) continue;

        declarationsChecked++;
        if (declared.includes("--dxa-font-")) consumesDxaToken = true;
        if (process.env.DXA_CHECK_VERBOSE) {
          console.log(`    ${rel}:${i + 1}  ${isThemeKey ? d[1] + " (theme key) = " : isCanvasShorthand ? "font: (canvas) = " : ""}${declared}`);
        }

        const chain = resolveChain(declared);
        const unresolved = chain.match(/var\(\s*(--[a-z0-9-]+)\s*\)/i);

        if (isThemeKey && LATIN_ONLY_THEME_KEYS.has(d[1])) {
          if (process.env.DXA_CHECK_VERBOSE) console.log(`      (${d[1]}: Latin-only by content — not required to name a CJK face)`);
          continue;
        }
        if (!hasCjk(chain)) {
          failures.push(
            `${rel}:${i + 1}  no CJK face in chain\n` +
              `      declared: ${declared}\n` +
              `      resolved: ${chain}` +
              (unresolved ? `\n      unresolved: ${unresolved[1]}` : ""),
          );
        }
      }
    });
  }

  if (consumesDxaToken) {
    const missing = BRIDGE_VARS.filter((v) => !varDefs.has(v));
    if (missing.length > 0) {
      failures.push(
        `[${surface.name}] dxa-ui bridge incomplete — --dxa-font-* is consumed but ` +
          `${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} never defined.\n` +
          `      var() on an undefined property is invalid at computed-value time,\n` +
          `      so the entire font-family declaration is dropped and text falls back\n` +
          `      to the UA default. Define them in a :root block after the token import.\n` +
          `      See dxa-ui/docs/FONT-LOADING.md §2.`,
      );
    }
  } else {
    // A surface that never consumes the token has not been migrated — on this
    // repo both must be. Fail loud rather than report "0 declarations, OK".
    failures.push(
      `[${surface.name}] --dxa-font-* is never consumed — the dxa-ui token is not ` +
        `wired into this surface (expected in its globals.css)`,
    );
  }

  const tokenPath = join(surface.root, surface.tokenFile);
  let lintCount = 0;
  if (existsSync(tokenPath)) {
    const lint = lintTokenCss(readFileSync(tokenPath, "utf8"));
    lintCount = lint.length;
    for (const msg of lint) failures.push(`${relative(REPO, tokenPath)}: ${msg}`);
  } else {
    failures.push(`[${surface.name}] ${relative(REPO, tokenPath)} does not exist`);
  }

  summary.push(
    `  ${surface.name}: ${declarationsChecked} declaration(s) across ${files.length} scanned file(s)` +
      (surface.exclude.length ? `, ${surface.exclude.length} excluded (see header)` : "") +
      (lintCount ? `, ${lintCount} lint problem(s)` : ""),
  );
  allFailures.push(...failures);
}

if (allFailures.length > 0) {
  console.error(`FAIL check-font-cjk — ${allFailures.length} problem(s)`);
  for (const f of allFailures) console.error("  - " + f);
  console.error("\n" + summary.join("\n"));
  console.error(
    "\n  A stack that renders Japanese must name a face with CJK coverage.\n" +
      "  system-ui is not accepted: it is CJK-capable on macOS and Windows-JA\n" +
      "  but not dependably elsewhere.",
  );
  process.exit(1);
}

console.log(
  "OK check-font-cjk — every font stack in stylesheets and JA-bearing files (incl. theme keys " +
    "and canvas font strings) resolves to a chain containing a CJK face; dxa-tokens.css passes " +
    "local() name-form and DERIVED-descriptor rules",
);
console.log(summary.join("\n"));
