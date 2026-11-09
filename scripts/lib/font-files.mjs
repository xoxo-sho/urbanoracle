/**
 * Helpers shared by scripts/vendor-fonts.mjs and the unit tests that check
 * the vendored fonts (src/__tests__/fonts/). No network. `typescript` (a
 * devDependency) parses the OG route; nothing else is imported.
 *
 * Ported from Parallel City (frontend/scripts/lib/font-files.mjs at
 * xoxo-sho/parallel-city be22994); `jsxText` / `jsxComputedChildren` are new
 * here, because this product's OG route also holds Japanese outside the
 * rendered tree (`alt`), which next/og never asks a font for.
 */

import ts from "typescript";

/**
 * The Unicode code points a TrueType/OpenType font has a glyph for, read from
 * its cmap table (format 12 if present, else format 4).
 * @param {Uint8Array} buf
 * @returns {Set<number>}
 */
export function readCmap(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tag = (o) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
  const version = tag(0);
  if (dv.getUint32(0) !== 0x00010000 && version !== "OTTO" && version !== "true") {
    throw new Error(`not a TrueType/OpenType font (starts with ${JSON.stringify(version)})`);
  }
  let cmap = -1;
  for (let i = 0; i < dv.getUint16(4); i++) {
    const rec = 12 + i * 16;
    if (tag(rec) === "cmap") cmap = dv.getUint32(rec + 8);
  }
  if (cmap < 0) throw new Error("font has no cmap table");

  const subtables = [];
  for (let i = 0; i < dv.getUint16(cmap + 2); i++) {
    const r = cmap + 4 + i * 8;
    subtables.push({ platform: dv.getUint16(r), encoding: dv.getUint16(r + 2), offset: cmap + dv.getUint32(r + 4) });
  }
  const unicode = (s) => s.platform === 0 || (s.platform === 3 && (s.encoding === 1 || s.encoding === 10));
  const pick = (format) => subtables.find((s) => unicode(s) && dv.getUint16(s.offset) === format);

  const points = new Set();
  const f12 = pick(12);
  if (f12) {
    const o = f12.offset;
    for (let g = 0; g < dv.getUint32(o + 12); g++) {
      const p = o + 16 + g * 12;
      const start = dv.getUint32(p);
      const end = dv.getUint32(p + 4);
      const glyph = dv.getUint32(p + 8);
      for (let c = start; c <= end; c++) if (glyph + (c - start) !== 0) points.add(c);
    }
    return points;
  }
  const f4 = pick(4);
  if (!f4) throw new Error("font has no format 4 or 12 Unicode cmap subtable");
  const o = f4.offset;
  const segX2 = dv.getUint16(o + 6);
  const ends = o + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const ranges = deltas + segX2;
  for (let i = 0; i < segX2 / 2; i++) {
    const end = dv.getUint16(ends + 2 * i);
    const start = dv.getUint16(starts + 2 * i);
    const delta = dv.getInt16(deltas + 2 * i);
    const rangeOffset = dv.getUint16(ranges + 2 * i);
    for (let c = start; c <= end && c !== 0xffff; c++) {
      let glyph;
      if (rangeOffset === 0) glyph = (c + delta) & 0xffff;
      else {
        glyph = dv.getUint16(ranges + 2 * i + rangeOffset + 2 * (c - start));
        if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
      }
      if (glyph !== 0) points.add(c);
    }
  }
  return points;
}

const parseTsx = (source) => ts.createSourceFile("route.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const isJsxParent = (node) => ts.isJsxElement(node) || ts.isJsxFragment(node);
const isLiteral = (node) => ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);

/**
 * The text a TSX file renders: its JSX text and the string literals among its
 * JSX children, in document order. Strings elsewhere in the file (an exported
 * `alt`, a colour constant) are not rendered and are not included.
 * @param {string} source
 * @returns {string}
 */
export function jsxText(source) {
  let out = "";
  const visit = (node) => {
    if (ts.isJsxText(node)) out += node.text;
    else if (ts.isJsxExpression(node) && isJsxParent(node.parent) && node.expression && isLiteral(node.expression)) {
      out += node.expression.text;
    }
    ts.forEachChild(node, visit);
  };
  visit(parseTsx(source));
  return out;
}

/**
 * The JSX children of a TSX file that are computed (`{title}`, `{a + b}`):
 * text `jsxText` cannot see. Returned as source snippets.
 * @param {string} source
 * @returns {string[]}
 */
export function jsxComputedChildren(source) {
  const out = [];
  const visit = (node) => {
    if (ts.isJsxExpression(node) && isJsxParent(node.parent) && node.expression && !isLiteral(node.expression)) {
      out.push(node.getText());
    }
    ts.forEachChild(node, visit);
  };
  visit(parseTsx(source));
  return out;
}

/**
 * The characters of a text that a font does not cover, in order of first
 * appearance. ASCII is skipped: every font here has it.
 * @param {string} text
 * @param {Set<number>} covered
 * @returns {string}
 */
export function charsNotCovered(text, covered) {
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp > 0x7f && !covered.has(cp) && !out.includes(ch)) out += ch;
  }
  return out;
}

/**
 * Satori's language table (next/dist/compiled/@vercel/og), limited to the CJK
 * entries. A character's group is the list of codes it matches.
 */
const SATORI_LANGS = {
  "ja-JP": /\p{scx=Hira}|\p{scx=Kana}|\p{scx=Han}|[　]|[＀-￯]/u,
  "ko-KR": /\p{scx=Hangul}/u,
  "zh-CN": /\p{scx=Han}/u,
  "zh-TW": /\p{scx=Han}/u,
  "zh-HK": /\p{scx=Han}/u,
};

/**
 * For the OG image: next/og draws with its bundled Latin font and, for the
 * characters that font lacks, fetches Noto Sans JP subsets from Google at
 * build time — one per Satori language group ("ja-JP" kana, "ja-JP|zh-…"
 * kanji, "ja-JP|ko-KR|zh-…" for 、。・), each with the group's characters in
 * order of first appearance. This returns those groups for a rendered text, so
 * the vendoring script can make the same requests. Checked against the
 * requests a real build of 9010a53 made on 2026-11-09 (three, same texts).
 * @param {string} text
 * @param {Set<number>} covered
 * @returns {Array<{code: string, text: string}>}
 */
export function ogFallbackGroups(text, covered) {
  const groups = new Map();
  for (const ch of charsNotCovered(text, covered)) {
    const code = Object.keys(SATORI_LANGS).filter((k) => SATORI_LANGS[k].test(ch)).join("|") || "unknown";
    groups.set(code, (groups.get(code) || "") + ch);
  }
  return [...groups].map(([code, text]) => ({ code, text }));
}
