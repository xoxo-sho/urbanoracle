#!/usr/bin/env node
/**
 * Vendor the site's web fonts into the repo so `next build` never contacts
 * Google. Run by hand, with network access, from the repository root:
 *
 *   node scripts/vendor-fonts.mjs
 *
 * This is the ONLY place allowed to fetch from Google Fonts
 * (src/__tests__/fonts/no-google-fonts.test.ts enforces that for everything
 * else; CI builds with no network at all, scripts/build-offline.sh).
 *
 * It makes the requests next/font/google made on every build until 2026-11 —
 * it calls Next's own helpers for the argument validation, the CSS URL, the
 * user agent, the preload choice and the fallback metrics — so the files, the
 * @font-face rules, the preloads and the fallback faces stay what the site
 * shipped before. FAMILIES below holds the arguments layout.tsx passed.
 * Design and most of the code: Parallel City (xoxo-sho/parallel-city PR #26,
 * frontend/scripts/vendor-fonts.mjs at be22994).
 *
 * Writes (and replaces):
 *   public/fonts/<family>/*.woff2   font files, named <subset or slice>-<first
 *                                   16 hex of sha256>.woff2 (content-addressed:
 *                                   served immutable by backend/core/spa.py)
 *   public/fonts/<family>/OFL.txt   licence
 *   styles/fonts.css                @font-face rules (one per Google slice, with
 *                                   its unicode-range), fallback faces and the
 *                                   --font-* variables. Outside src/ and public/:
 *                                   not a Tailwind theme file (check:fonts reads
 *                                   every --font-* under src/ as a stack that
 *                                   must name a Japanese face) and not exported
 *                                   raw — the page uses the copy Next bundles
 *   src/app/vendored-fonts.ts       the files to preload
 *   src/app/_og-fonts/              fonts for src/app/opengraph-image.tsx
 *   scripts/vendor-fonts.lock.json  what was fetched: upstream URL, version,
 *                                   size and sha256 of every file
 *   docs/vendored-fonts.md          the same, to read
 *
 * After running: npm test && npm run build && npm run test:fonts, then review
 * the diff (a changed file name means Google changed that file).
 */

import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { jsxText, ogFallbackGroups, readCmap } from "./lib/font-files.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const NEXT_GOOGLE = "next/dist/compiled/@next/font/dist/google";
const { validateGoogleFontFunctionCall } = require(`${NEXT_GOOGLE}/validate-google-font-function-call`);
const { getFontAxes } = require(`${NEXT_GOOGLE}/get-font-axes`);
const { getGoogleFontsUrl } = require(`${NEXT_GOOGLE}/get-google-fonts-url`);
const { fetchCSSFromGoogleFonts } = require(`${NEXT_GOOGLE}/fetch-css-from-google-fonts`);
const { fetchFontFile } = require(`${NEXT_GOOGLE}/fetch-font-file`);
const { findFontFilesInCss } = require(`${NEXT_GOOGLE}/find-font-files-in-css`);
const { calculateSizeAdjustValues } = require("next/dist/server/font-utils");
const NEXT_VERSION = require("next/package.json").version;

/**
 * The three next/font/google calls src/app/layout.tsx made at 9010a53,
 * argument for argument. Geist is the Latin face and Geist Mono the mono face
 * (the product's own choices); Noto Sans JP is the body JA face the dxa-ui
 * bridge points --dxa-face-ja at. Noto Sans JP is not preloaded: it has 124
 * unicode-range slices.
 */
const FAMILIES = [
  {
    fn: "Geist",
    args: { variable: "--font-geist-sans", subsets: ["latin"] },
    dir: "geist",
    ofl: "geist",
  },
  {
    fn: "Geist_Mono",
    args: { variable: "--font-geist-mono", subsets: ["latin"] },
    dir: "geist-mono",
    ofl: "geistmono",
  },
  {
    fn: "Noto_Sans_JP",
    args: { variable: "--font-noto-sans-jp", weight: ["400", "500", "700"], subsets: ["latin"], preload: false, display: "swap" },
    dir: "noto-sans-jp",
    ofl: "notosansjp",
  },
];

const PUBLIC_FONTS = join(ROOT, "public", "fonts");
const FONTS_CSS = join(ROOT, "styles", "fonts.css");
const PRELOADS_TS = join(ROOT, "src", "app", "vendored-fonts.ts");
const OG_DIR = join(ROOT, "src", "app", "_og-fonts");
const OG_ROUTE = join(ROOT, "src", "app", "opengraph-image.tsx");
const LOCK = join(ROOT, "scripts", "vendor-fonts.lock.json");
const DOC = join(ROOT, "docs", "vendored-fonts.md");
// next/og's own default font (it registers it as "geist", weight 400) and the
// user agent it sends when it fetches a fallback subset
// (next/dist/compiled/@vercel/og/index.node.js, loadGoogleFont).
const OG_DEFAULT_FONT_REL = "next/dist/compiled/@vercel/og/Geist-Regular.ttf";
const OG_DEFAULT_FONT = require.resolve(OG_DEFAULT_FONT_REL);
const OG_UA =
  "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1";
const CLIENT = { "User-Agent": "urbanoracle-vendor-fonts" };

const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const today = new Date().toISOString().slice(0, 10);
const log = (msg) => console.log(msg);
const num = (n) => n.toLocaleString("en-US");

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

async function fetchText(url, headers = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

/**
 * Google's CSS, refetched while it points at extension-less /l/font?kit=
 * URLs. Google serves those now and then — the answer next/font fails a build
 * on (vercel/next.js#99114) — and the static /s/…woff2 files are what the site
 * shipped.
 */
async function fetchStaticCss(url, family) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    const css = await fetchCSSFromGoogleFonts(url, family, false);
    const urls = [...css.matchAll(/src: url\((.+?)\) format\('(.+?)'\)/g)];
    if (urls.length === 0) throw new Error(`${family}: no font files in ${url}`);
    const bad = urls.filter(([, u, fmt]) => fmt !== "woff2" || !/^https:\/\/fonts\.gstatic\.com\/s\/.+\.woff2$/.test(u));
    if (bad.length === 0) return css;
    log(`  ${family}: ${bad.length} non-static URL(s) (e.g. ${bad[0][1].slice(0, 60)}…), retrying (${attempt}/6)`);
    await new Promise((r) => setTimeout(r, 3000 * attempt));
  }
  throw new Error(`${family}: Google kept answering with non-static font URLs; try again later`);
}

/**
 * Per font URL, in CSS order: a label for its file name and the weights it
 * serves. The label is the subset comment directly above the face ("latin",
 * "cyrillic", "[119]" → "119") or else Google's slice number from the URL
 * (".../xyz.42.woff2" → "42").
 */
function describeUrls(css) {
  const info = new Map();
  let comment = "";
  let weight = "";
  for (const line of css.split("\n")) {
    const s = /\/\* (.+?) \*\//.exec(line);
    if (s) comment = s[1];
    const w = /font-weight: (.+?);/.exec(line);
    if (w) weight = w[1];
    const u = /src: url\((.+?)\)/.exec(line);
    if (u) {
      const slice = /\.(\d+)\.woff2$/.exec(u[1])?.[1];
      const label = (comment || slice || "file").replace(/[[\]]/g, "").replace(/[^a-z0-9-]+/gi, "-");
      if (!info.has(u[1])) info.set(u[1], { label, weights: new Set() });
      info.get(u[1]).weights.add(weight);
      comment = "";
    }
  }
  return info;
}

function fallbackFace(family) {
  const m = calculateSizeAdjustValues(family);
  return {
    metrics: { local: m.fallbackFont, ascent: m.ascent, descent: m.descent, lineGap: m.lineGap, sizeAdjust: m.sizeAdjust },
    css: [
      "@font-face {",
      `  font-family: '${family} Fallback';`,
      `  src: local("${m.fallbackFont}");`,
      `  ascent-override: ${m.ascent}%;`,
      `  descent-override: ${m.descent}%;`,
      `  line-gap-override: ${m.lineGap}%;`,
      `  size-adjust: ${m.sizeAdjust}%;`,
      "}",
    ].join("\n"),
  };
}

/** The licence at one commit of google/fonts, so the URL in the lock keeps naming the text that was copied. */
async function fetchLicence(commit, name) {
  const url = `https://raw.githubusercontent.com/google/fonts/${commit}/ofl/${name}/OFL.txt`;
  const text = await fetchText(url, CLIENT);
  if (!text.includes("SIL OPEN FONT LICENSE Version 1.1")) throw new Error(`${url} is not the OFL 1.1 text`);
  return { url, text };
}

async function vendorFamily(f, commit) {
  const opts = validateGoogleFontFunctionCall(f.fn, f.args);
  const url = getGoogleFontsUrl(
    opts.fontFamily,
    getFontAxes(opts.fontFamily, opts.weights, opts.styles, opts.selectedVariableAxes),
    opts.display,
  );
  log(`${opts.fontFamily}: ${url}`);
  let css = await fetchStaticCss(url, opts.fontFamily);
  const files = findFontFilesInCss(css, opts.preload ? opts.subsets : undefined);
  const info = describeUrls(css);
  const multiWeight = opts.weights.length > 1;

  const versions = new Set(files.map(({ googleFontFileUrl }) => /^https:\/\/fonts\.gstatic\.com\/s\/[a-z0-9]+\/(v\d+)\//.exec(googleFontFileUrl)?.[1]));
  if (versions.size !== 1 || versions.has(undefined)) throw new Error(`${opts.fontFamily}: expected one version in the font URLs, got ${[...versions].join(", ")}`);
  const version = [...versions][0];

  const dir = join(PUBLIC_FONTS, f.dir);
  mkdirSync(dir, { recursive: true });
  const written = await pool(files, 8, async ({ googleFontFileUrl, preloadFontFile }) => {
    const buf = await fetchFontFile(googleFontFileUrl, false);
    if (buf.subarray(0, 4).toString("latin1") !== "wOF2") throw new Error(`${googleFontFileUrl} is not woff2`);
    const { label, weights } = info.get(googleFontFileUrl);
    const weightPrefix = multiWeight && weights.size === 1 ? `${[...weights][0]}-` : "";
    const hash = sha(buf);
    const name = `${weightPrefix}${label}-${hash.slice(0, 16)}.woff2`;
    writeFileSync(join(dir, name), buf);
    return {
      file: name,
      bytes: buf.length,
      sha256: hash,
      upstream: googleFontFileUrl,
      weights: [...weights],
      preload: preloadFontFile,
      href: `/fonts/${f.dir}/${name}`,
    };
  });
  const keep = new Set(written.map((w) => w.file));
  if (keep.size !== written.length) throw new Error(`${opts.fontFamily}: two files got the same name`);
  for (const old of readdirSync(dir)) if (old.endsWith(".woff2") && !keep.has(old)) rmSync(join(dir, old));

  for (const w of written) css = css.split(w.upstream).join(w.href);
  if (/fonts\.g(oogleapis|static)\.com/.test(css)) throw new Error(`${opts.fontFamily}: a Google URL survived the rewrite`);

  const licence = await fetchLicence(commit, f.ofl);
  writeFileSync(join(dir, "OFL.txt"), licence.text);
  const fallback = fallbackFace(opts.fontFamily);
  const faces = (css.match(/@font-face/g) || []).length;
  log(`  ${version}: ${faces} @font-face, ${written.length} files, ${written.reduce((n, w) => n + w.bytes, 0)} B`);
  return { f, opts, url, version, css: css.trim(), fallback, written, faces, licence: { file: "OFL.txt", url: licence.url, sha256: sha(Buffer.from(licence.text)) } };
}

/**
 * The OG image's fonts: next/og's own Latin font, plus the Noto Sans JP
 * subsets next/og fetched at build time — the same requests (one per Satori
 * language group, same text, same user agent), registered by the route under
 * the name, lang, weight and style next/og gives them (loadDynamicAsset).
 * Separate files, not one merged subset: Parallel City measured one merged
 * subset rendering 4,580 pixels differently (2026-11-02), and the separate
 * files reproduce the PNG byte for byte — here too (docs/vendored-fonts.md).
 */
async function vendorOgFonts(commit) {
  mkdirSync(OG_DIR, { recursive: true });
  for (const old of readdirSync(OG_DIR)) rmSync(join(OG_DIR, old));
  const latin = readFileSync(OG_DEFAULT_FONT);
  writeFileSync(join(OG_DIR, "Geist-Regular.ttf"), latin);
  const fonts = [{ file: "Geist-Regular.ttf", bytes: latin.length, sha256: sha(latin), source: `node_modules/${OG_DEFAULT_FONT_REL} (next ${NEXT_VERSION})` }];

  const groups = ogFallbackGroups(jsxText(readFileSync(OG_ROUTE, "utf8")), readCmap(latin));
  const manifest = [];
  for (const [i, { code, text }] of groups.entries()) {
    const lang = code.split("|")[0];
    // next/og picks the first family of the group's languages whose ranges
    // cover the text; for every group starting with ja-JP that is Noto Sans JP.
    if (lang !== "ja-JP") throw new Error(`OG: language group ${code} (${text}) is not handled — extend vendorOgFonts`);
    const cssUrl = `https://fonts.googleapis.com/css2?family=Noto+Sans+JP&text=${encodeURIComponent(text)}`;
    const css = await fetchText(cssUrl, { "User-Agent": OG_UA });
    const m = css.match(/src: url\((.+)\) format\('(opentype|truetype)'\)/);
    if (!m) throw new Error(`OG: no TrueType/OpenType source in ${cssUrl}`);
    const res = await fetch(m[1]);
    if (!res.ok) throw new Error(`OG: ${m[1]}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const covered = readCmap(buf);
    const missing = [...text].filter((ch) => !covered.has(ch.codePointAt(0)));
    if (missing.length) throw new Error(`OG: the ${code} subset lacks ${missing.join(" ")}`);
    const file = `noto-sans-jp-og-${i + 1}.ttf`;
    writeFileSync(join(OG_DIR, file), buf);
    manifest.push({ file, name: `satori_${lang}_fallback_${text}`, lang, weight: 400, style: "normal" });
    fonts.push({ file, bytes: buf.length, sha256: sha(buf), source: m[1], cssUrl, code, text, version: /[?&]v=(v\d+)/.exec(m[1])?.[1] ?? "" });
    log(`OG ${code}: ${[...text].length} characters, ${buf.length} B`);
  }
  writeFileSync(join(OG_DIR, "og-fonts.json"), JSON.stringify(manifest, null, 2) + "\n");

  const licences = [];
  for (const [file, name] of [["OFL-Geist.txt", "geist"], ["OFL-NotoSansJP.txt", "notosansjp"]]) {
    const licence = await fetchLicence(commit, name);
    writeFileSync(join(OG_DIR, file), licence.text);
    licences.push({ file, url: licence.url, sha256: sha(Buffer.from(licence.text)) });
  }
  return { fonts, licences };
}

function writeCss(results) {
  const parts = [
    `/* Generated by scripts/vendor-fonts.mjs on ${today} (Next ${NEXT_VERSION}). Do not edit:`,
    "   re-run the script. Imported by src/app/layout.tsx; the files are in",
    "   public/fonts/<family>/ and are served from /fonts/. Sources, versions and",
    "   sha256 of every file: scripts/vendor-fonts.lock.json, docs/vendored-fonts.md. */",
  ];
  for (const r of results) {
    parts.push("", `/* ==== ${r.opts.fontFamily} ==== */`, r.css, r.fallback.css);
  }
  // On :root — the <html> element, where next/font's .variable classes put
  // them — and in the form next/font wrote them.
  parts.push("", ":root {");
  for (const r of results) {
    const fam = r.opts.fontFamily;
    parts.push(`  ${r.opts.variable}: "${fam}", "${fam} Fallback";`);
  }
  parts.push("}", "");
  mkdirSync(dirname(FONTS_CSS), { recursive: true });
  writeFileSync(FONTS_CSS, parts.join("\n"));
}

function writePreloads(results) {
  const hrefs = results.flatMap((r) => r.written.filter((w) => w.preload).map((w) => w.href));
  writeFileSync(
    PRELOADS_TS,
    [
      "// Generated by scripts/vendor-fonts.mjs. Do not edit: re-run the script.",
      "//",
      "// The font files the root layout preloads: the latin file of Geist and of",
      "// Geist Mono, the two next/font/google preloaded (Noto Sans JP has 124",
      "// unicode-range slices and is loaded on demand, as before).",
      "export const PRELOAD_FONTS = [",
      ...hrefs.map((h) => `  ${JSON.stringify(h)},`),
      "] as const;",
      "",
    ].join("\n"),
  );
  return hrefs;
}

function writeLock(results, og, commit) {
  const lock = {
    generated: today,
    next: NEXT_VERSION,
    licenceCommit: commit,
    families: results.map((r) => ({
      family: r.opts.fontFamily,
      dir: r.f.dir,
      variable: r.opts.variable,
      weights: r.opts.weights,
      cssUrl: r.url,
      version: r.version,
      faces: r.faces,
      licence: r.licence,
      fallback: r.fallback.metrics,
      files: r.written.map(({ file, bytes, sha256, upstream, weights, preload }) => ({ file, bytes, sha256, upstream, weights, preload })),
    })),
    og,
  };
  writeFileSync(LOCK, JSON.stringify(lock, null, 2) + "\n");
}

function writeDoc(results, og, preloads, commit) {
  const total = results.reduce((n, r) => n + r.written.reduce((m, w) => m + w.bytes, 0), 0);
  const rows = results.map((r) => {
    const bytes = r.written.reduce((n, w) => n + w.bytes, 0);
    return `| ${r.opts.fontFamily} | \`public/fonts/${r.f.dir}/\` | ${r.version} | ${r.opts.weights.join(", ")} | ${r.faces} | ${r.written.length} | ${num(bytes)} | \`${r.opts.variable}\` |`;
  });
  const metrics = results.map((r) => {
    const m = r.fallback.metrics;
    return `| ${r.opts.fontFamily} | ${m.local} | ${m.ascent}% | ${m.descent}% | ${m.lineGap}% | ${m.sizeAdjust}% |`;
  });
  const fileTables = results.map((r) =>
    [
      `### ${r.opts.fontFamily} ${r.version} — \`public/fonts/${r.f.dir}/\``,
      "",
      `Stylesheet: ${r.url}`,
      "",
      `Licence: \`OFL.txt\` (SIL Open Font License 1.1), sha256 \`${r.licence.sha256}\`, from ${r.licence.url}`,
      "",
      "| File | Bytes | sha256 | Upstream |",
      "|:--|--:|:--|:--|",
      ...r.written.map((w) => `| \`${w.file}\` | ${num(w.bytes)} | \`${w.sha256}\` | ${w.upstream} |`),
    ].join("\n"),
  );
  const ogRows = og.fonts.map((f) => `| \`${f.file}\` | ${num(f.bytes)} | \`${f.sha256}\` | ${f.text ? `${f.code}: ${f.text}` : "next/og's default font"} | ${f.source} |`);
  const md = `# Vendored web fonts

Generated by \`scripts/vendor-fonts.mjs\` on **${today}** with Next ${NEXT_VERSION}.
Do not edit this file or the files it lists by hand: re-run the script.

The site used to load Geist, Geist Mono and Noto Sans JP with
\`next/font/google\`, which downloaded the CSS and every font file from Google
on each clean \`next build\`, and failed the build when Google answered in a
shape Next did not expect (vercel/next.js#99114). The files now live in the
repository, so neither the build nor the browser contacts Google.

The script makes the requests \`next/font/google\` made (Next's own helpers,
the same user agent), keeps one \`@font-face\` rule per Google slice with its
\`unicode-range\`, and writes the same fallback faces and CSS variables.
\`src/app/layout.tsx\` imports \`styles/fonts.css\` and preloads the files listed
in \`src/app/vendored-fonts.ts\`. \`styles/fonts.css\` is outside \`public/\`, so it
is not exported to \`out/\`: the page loads the bundled copy under
\`/_next/static/\`. The two heading faces (\`src/app/fonts/\`, Source Serif 4 and
Zen Old Mincho subsets) were already in the repository and still go through
\`next/font/local\`.

The machine-readable copy of everything below is
\`scripts/vendor-fonts.lock.json\`; \`src/__tests__/fonts/vendored-fonts.test.ts\`
checks the files on disk against it.

## Families

| Family | Folder | Version | Weights | \`@font-face\` | Files | Bytes | CSS variable |
|:--|:--|:--|:--|--:|--:|--:|:--|
${rows.join("\n")}
| **Total** | | | | | **${results.reduce((n, r) => n + r.written.length, 0)}** | **${num(total)}** | |

All faces are \`font-style: normal\` and \`font-display: swap\`. Preloaded
(${preloads.length} files, the \`latin\` file of the two families that were preloaded before):
${preloads.map((p) => `\`${p}\``).join(", ")}.

File names are \`<subset or Google slice number>-<first 16 hex of
sha256>.woff2\`. A name changes whenever the content does, which is why the
backend serves these files with an immutable one-year cache
(\`backend/core/spa.py\`), as it does for \`/_next/static/\`.

## Fallback faces

\`src: local(...)\` faces with these overrides, the values \`next/font/google\`
generated (\`calculateSizeAdjustValues\` in Next ${NEXT_VERSION}):

| Family | local() | ascent-override | descent-override | line-gap-override | size-adjust |
|:--|:--|--:|--:|--:|--:|
${metrics.join("\n")}

## Sources

Requested with Next's user agent (\`Chrome/104.0.0.0\`,
\`next/dist/compiled/@next/font/dist/google/fetch-resource.js\`). Licences are
the \`OFL.txt\` of each family in google/fonts at commit \`${commit}\`.

${fileTables.join("\n\n")}

## OG image fonts — \`src/app/_og-fonts/\`

\`src/app/opengraph-image.tsx\` is rendered at build time by \`next/og\`. For
the characters its bundled Latin font lacks, \`next/og\` fetched Noto Sans JP
subsets from Google on every build: one per Satori language group, with the
group's characters as \`text=\`, using \`next/og\`'s user agent — and drew the
card without those glyphs, silently, when the fetch failed. The script makes
the same requests and the route passes the files itself, under the names
\`next/og\` gives them (\`og-fonts.json\`).

| File | Bytes | sha256 | Covers | Source |
|:--|--:|:--|:--|:--|
${ogRows.join("\n")}

The subsets are requested from
\`https://fonts.googleapis.com/css2?family=Noto+Sans+JP&text=<characters>\` and
stay separate files (one merged subset does not reproduce the image).
Licences: ${og.licences.map((l) => `\`${l.file}\` (sha256 \`${l.sha256}\`, ${l.url})`).join("; ")}.

\`src/__tests__/fonts/vendored-fonts.test.ts\` fails if the card gains a
character these fonts lack: re-run the script after changing the OG text.

## Re-running

\`\`\`bash
node scripts/vendor-fonts.mjs
npm test && npm run build && npm run test:fonts
\`\`\`

The script replaces the files in each family folder, \`styles/fonts.css\`,
\`src/app/vendored-fonts.ts\`, \`src/app/_og-fonts/\`, the lock and this file.
Review the diff: a changed file name means Google changed that file.

CI builds with no network (\`scripts/build-offline.sh\`): a build that needs
anything from outside fails there.
`;
  mkdirSync(dirname(DOC), { recursive: true });
  writeFileSync(DOC, md);
  return total;
}

const commit = (await fetchText("https://api.github.com/repos/google/fonts/commits/main", { ...CLIENT, Accept: "application/vnd.github.sha" })).trim();
if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`google/fonts: unexpected commit id ${commit.slice(0, 60)}`);
log(`google/fonts at ${commit} (licences)`);

const results = [];
for (const f of FAMILIES) results.push(await vendorFamily(f, commit));
for (const stale of readdirSync(PUBLIC_FONTS)) {
  if (!FAMILIES.some((f) => f.dir === stale)) rmSync(join(PUBLIC_FONTS, stale), { recursive: true });
}
const og = await vendorOgFonts(commit);
writeCss(results);
const preloads = writePreloads(results);
writeLock(results, og, commit);
const total = writeDoc(results, og, preloads, commit);
log(`\nTotal: ${results.reduce((n, r) => n + r.written.length, 0)} files, ${total} B`);
log(`Preload: ${preloads.length} files`);
log(`Wrote ${relative(ROOT, PUBLIC_FONTS)}/, ${relative(ROOT, FONTS_CSS)}, ${relative(ROOT, PRELOADS_TS)}, ${relative(ROOT, OG_DIR)}/, ${relative(ROOT, LOCK)}, ${relative(ROOT, DOC)}`);
