import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
// Plain .mjs helpers shared with scripts/vendor-fonts.mjs (JSDoc-typed, allowJs).
import { charsNotCovered, jsxComputedChildren, jsxText, readCmap } from "../../../scripts/lib/font-files.mjs";

/**
 * Guard (iv), the part a unit test can hold: the vendored fonts are the files
 * the lock records, and the stylesheet, the preload list and the OG route
 * agree with them.
 *
 *   public/fonts/<family>/*.woff2 + OFL.txt   the web fonts and their licence
 *   styles/fonts.css                          one @font-face per Google slice
 *   src/app/vendored-fonts.ts                 the two files to preload
 *   src/app/_og-fonts/                        the fonts of the OG card
 *   scripts/vendor-fonts.lock.json            upstream URL, version, sha256
 *
 * All of it is written by scripts/vendor-fonts.mjs. The backend serves
 * /fonts/*.woff2 with an immutable one-year cache, which is only safe because
 * each file name carries a hash of its content — asserted here.
 *
 * Everything is read from disk, not imported, so this file loads (and fails
 * on its assertions) before the fonts exist.
 *
 * RED on main (9010a53): none of these files exists.
 */

const ROOT = process.cwd();
if (JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf-8")).name !== "urban-oracle") {
  throw new Error(`not the UrbanOracle root: ${ROOT}`);
}
const FONTS = join(ROOT, "public", "fonts");
const LOCK = join(ROOT, "scripts", "vendor-fonts.lock.json");
const CSS = join(ROOT, "styles", "fonts.css");
const OG = join(ROOT, "src", "app", "_og-fonts");
const OG_ROUTE = join(ROOT, "src", "app", "opengraph-image.tsx");

interface LockFile {
  file: string;
  bytes: number;
  sha256: string;
  upstream: string;
  weights: string[];
  preload: boolean;
}
interface LockFamily {
  family: string;
  dir: string;
  variable: string;
  cssUrl: string;
  version: string;
  faces: number;
  licence: { file: string; url: string; sha256: string };
  fallback: { local: string; ascent: string; descent: string; lineGap: string; sizeAdjust: string };
  files: LockFile[];
}
interface LockOgFont {
  file: string;
  bytes: number;
  sha256: string;
  source: string;
  text?: string;
}
interface Lock {
  generated: string;
  next: string;
  families: LockFamily[];
  og: { fonts: LockOgFont[]; licences: { file: string; url: string; sha256: string }[] };
}

const sha256 = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
const need = (file: string) => {
  if (!existsSync(file)) throw new Error(`missing ${file.slice(ROOT.length + 1)} — run: node scripts/vendor-fonts.mjs`);
  return file;
};
const lock = (): Lock => JSON.parse(readFileSync(need(LOCK), "utf8"));
const css = (): string => readFileSync(need(CSS), "utf8");
const cssUrls = (): string[] => [...css().matchAll(/url\(([^)]+)\)/g)].map((m) => m[1].replace(/^["']|["']$/g, ""));

/** Family → the CSS variable the dxa-ui bridge in globals.css reads, and its @font-face count. */
const EXPECTED = {
  Geist: { dir: "geist", variable: "--font-geist-sans", faces: 5, files: 5 },
  "Geist Mono": { dir: "geist-mono", variable: "--font-geist-mono", faces: 6, files: 6 },
  // 124 unicode-range slices, each one variable file serving 400, 500 and 700.
  "Noto Sans JP": { dir: "noto-sans-jp", variable: "--font-noto-sans-jp", faces: 372, files: 124 },
} as const;

describe("public/fonts — the vendored web fonts", () => {
  it("the lock lists the three families, each with its upstream stylesheet, version and licence", () => {
    const families = lock().families;
    expect(families.map((f) => f.family)).toEqual(Object.keys(EXPECTED));
    for (const f of families) {
      const want = EXPECTED[f.family as keyof typeof EXPECTED];
      expect(f.dir).toBe(want.dir);
      expect(f.variable).toBe(want.variable);
      expect(f.faces).toBe(want.faces);
      expect(f.files.length).toBe(want.files);
      expect(f.cssUrl).toMatch(/^https:\/\/fonts\.googleapis\.com\/css2\?family=/);
      expect(f.version).toMatch(/^v\d+$/);
      expect(f.licence.url).toMatch(/^https:\/\/raw\.githubusercontent\.com\/google\/fonts\/[0-9a-f]{40}\/ofl\/[a-z]+\/OFL\.txt$/);
    }
  });

  it("every file in the lock is on disk with the recorded size and sha256, under a name that carries its content hash", () => {
    const bad: string[] = [];
    for (const f of lock().families) {
      for (const file of f.files) {
        const p = join(FONTS, f.dir, file.file);
        if (!existsSync(p)) {
          bad.push(`${f.dir}/${file.file}: missing`);
          continue;
        }
        const hash = sha256(p);
        if (hash !== file.sha256) bad.push(`${f.dir}/${file.file}: sha256 is ${hash}, the lock says ${file.sha256}`);
        if (statSync(p).size !== file.bytes) bad.push(`${f.dir}/${file.file}: ${statSync(p).size} bytes, the lock says ${file.bytes}`);
        if (!file.file.endsWith(`-${hash.slice(0, 16)}.woff2`)) bad.push(`${f.dir}/${file.file}: name does not carry ${hash.slice(0, 16)}`);
        if (readFileSync(p).subarray(0, 4).toString("latin1") !== "wOF2") bad.push(`${f.dir}/${file.file}: not woff2`);
        if (!file.upstream.startsWith(`https://fonts.gstatic.com/s/${f.dir.replace(/-/g, "")}/${f.version}/`)) {
          bad.push(`${f.dir}/${file.file}: upstream ${file.upstream} is not ${f.family} ${f.version} on fonts.gstatic.com`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("holds nothing but the lock's files and one OFL.txt per family", () => {
    need(FONTS);
    const families = lock().families;
    expect(readdirSync(FONTS).sort()).toEqual(families.map((f) => f.dir).sort());
    for (const f of families) {
      const onDisk = readdirSync(join(FONTS, f.dir)).sort();
      expect(onDisk).toEqual([...f.files.map((x) => x.file), "OFL.txt"].sort());
      const ofl = join(FONTS, f.dir, "OFL.txt");
      expect(sha256(ofl), `${f.dir}/OFL.txt`).toBe(f.licence.sha256);
      expect(readFileSync(ofl, "utf8")).toContain("SIL OPEN FONT LICENSE Version 1.1");
    }
  });
});

describe("styles/fonts.css — the stylesheet the root layout imports", () => {
  it("every @font-face src is a vendored file, and every vendored file is used", () => {
    const urls = cssUrls();
    const known = new Set(lock().families.flatMap((f) => f.files.map((x) => `/fonts/${f.dir}/${x.file}`)));
    expect(urls.length).toBe(383); // 5 + 6 + 372
    expect(urls.filter((u) => !known.has(u))).toEqual([]);
    expect([...known].filter((u) => !urls.includes(u))).toEqual([]);
  });

  it("declares each family under its literal name, with the face count Google's stylesheet had", () => {
    const text = css();
    for (const [family, want] of Object.entries(EXPECTED)) {
      const faces = [...text.matchAll(/@font-face\s*\{[^}]*\}/g)].filter((m) => new RegExp(`font-family:\\s*'${family}';`).test(m[0]));
      expect(faces.length, family).toBe(want.faces);
      for (const face of faces) {
        expect(face[0]).toMatch(/font-display:\s*swap;/);
        expect(face[0]).toMatch(/unicode-range:\s*U\+/);
      }
    }
    expect(text).not.toMatch(/fonts\.g(oogleapis|static)\.com/);
  });

  it("defines the three variables the bridge reads, each naming its family and its size-adjusted fallback", () => {
    const text = css();
    for (const f of lock().families) {
      expect(text).toContain(`${f.variable}: "${f.family}", "${f.family} Fallback";`);
      const m = f.fallback;
      expect(text).toContain(
        [
          "@font-face {",
          `  font-family: '${f.family} Fallback';`,
          `  src: local("${m.local}");`,
          `  ascent-override: ${m.ascent}%;`,
          `  descent-override: ${m.descent}%;`,
          `  line-gap-override: ${m.lineGap}%;`,
          `  size-adjust: ${m.sizeAdjust}%;`,
          "}",
        ].join("\n"),
      );
    }
    const defined = [...text.matchAll(/^\s*(--font-[a-z0-9-]+):/gm)].map((m) => m[1]).sort();
    expect(defined).toEqual(Object.values(EXPECTED).map((e) => e.variable).sort());
  });

  it("the fallback metrics are the ones next/font/google emitted on 9010a53", () => {
    // Measured in out/_next/static/chunks/*.css of the 9010a53 build, 2026-11-09.
    const byFamily = Object.fromEntries(lock().families.map((f) => [f.family, f.fallback]));
    expect(byFamily).toEqual({
      Geist: { local: "Arial", ascent: "95.94", descent: "28.16", lineGap: "0.00", sizeAdjust: "104.76" },
      "Geist Mono": { local: "Arial", ascent: "74.67", descent: "21.92", lineGap: "0.00", sizeAdjust: "134.59" },
      "Noto Sans JP": { local: "Arial", ascent: "110.73", descent: "27.49", lineGap: "0.00", sizeAdjust: "104.76" },
    });
  });

  it("the preload list is the latin file of Geist and of Geist Mono — the two next/font preloaded on purpose", () => {
    const source = readFileSync(need(join(ROOT, "src", "app", "vendored-fonts.ts")), "utf8");
    const listed = [...source.matchAll(/"(\/fonts\/[^"]+)"/g)].map((m) => m[1]);
    const fromLock = lock().families.flatMap((f) => f.files.filter((x) => x.preload).map((x) => `/fonts/${f.dir}/${x.file}`));
    expect(listed).toEqual(fromLock);
    expect(listed.length).toBe(2);
    expect(listed[0]).toMatch(/^\/fonts\/geist\/latin-[0-9a-f]{16}\.woff2$/);
    expect(listed[1]).toMatch(/^\/fonts\/geist-mono\/latin-[0-9a-f]{16}\.woff2$/);
  });
});

describe("src/app/_og-fonts — the fonts of the OG card", () => {
  it("the files are the ones the lock records, with their licences", () => {
    const og = lock().og;
    expect(og.fonts.length).toBeGreaterThan(1);
    const expected = [...og.fonts.map((f) => f.file), ...og.licences.map((l) => l.file), "og-fonts.json"].sort();
    expect(readdirSync(need(OG)).sort()).toEqual(expected);
    for (const f of og.fonts) {
      expect(sha256(join(OG, f.file)), f.file).toBe(f.sha256);
      expect(statSync(join(OG, f.file)).size, f.file).toBe(f.bytes);
    }
    for (const l of og.licences) expect(sha256(join(OG, l.file)), l.file).toBe(l.sha256);
  });

  it("the fonts cover every character the card renders, so next/og has nothing to fetch", () => {
    const route = readFileSync(OG_ROUTE, "utf8");
    const rendered = jsxText(route);
    expect(rendered).toContain("都市の資産価値を、"); // non-vacuity: the card's text was found
    expect(jsxComputedChildren(route), "a computed JSX child is text this check cannot see").toEqual([]);

    const covered = new Set<number>();
    for (const f of lock().og.fonts) for (const cp of readCmap(readFileSync(join(need(OG), f.file)))) covered.add(cp);
    expect(
      charsNotCovered(rendered, covered),
      "opengraph-image.tsx renders characters the vendored fonts lack — next/og would fetch them from Google at build time. Re-run: node scripts/vendor-fonts.mjs",
    ).toBe("");
  });

  it("the route hands next/og its fonts itself", () => {
    const route = readFileSync(OG_ROUTE, "utf8");
    expect(route).toMatch(/from\s+["']\.\/_og-fonts\/og-fonts\.json["']/);
    expect(route).toMatch(/\bfonts:\s*\[/);
  });
});
