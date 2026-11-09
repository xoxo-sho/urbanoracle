import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard (i): nothing that feeds the build or ships to the browser depends on
 * Google Fonts.
 *
 * With next/font/google every clean `next build` (CI, Cloud Build) downloaded
 * the CSS and all 135 font files from Google, and failed when Google answered
 * in a shape Next did not expect (vercel/next.js#99114: 2 of the 10 deploys
 * up to 2026-11-09). The fonts are vendored under public/fonts/ by
 * scripts/vendor-fonts.mjs, which is run by hand.
 *
 * Not scanned, with reason:
 *   - scripts/vendor-fonts.mjs and scripts/vendor-fonts.lock.json: the one
 *     place allowed to fetch from Google, and its record of what it fetched
 *     (upstream URL and sha256 of every file). Neither is read by the build.
 *   - this file: it has to name what it looks for.
 *   - e2e/: Playwright specs assert that no request goes to these hosts.
 *   - *.md: documentation (docs/vendored-fonts.md lists the source URLs).
 *   - comments: a host named in a comment fetches nothing. The vendored
 *     dxa-ui token file records where a metric was measured ("source:
 *     fonts.gstatic.com …") and must stay byte-identical to dxa-ui.
 *
 * RED on main (9010a53): src/app/layout.tsx:2 imports next/font/google, and
 * two tests mock it.
 */

const ROOT = process.cwd();
if (JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf-8")).name !== "urban-oracle") {
  throw new Error(`not the UrbanOracle root: ${ROOT}`);
}
const SELF = join(ROOT, "src", "__tests__", "fonts", "no-google-fonts.test.ts");

const SCAN_DIRS = ["src", "scripts", "public", "styles"];
const ROOT_FILES = ["next.config.ts", "postcss.config.mjs", "package.json", "tsconfig.json", "eslint.config.mjs", "Dockerfile"];
const EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".json", ".html"]);
const SKIP_DIRS = new Set(["node_modules", ".next", "out"]);
const EXCLUDED = new Set([
  join(ROOT, "scripts", "vendor-fonts.mjs"),
  join(ROOT, "scripts", "vendor-fonts.lock.json"),
  SELF,
]);

const FORBIDDEN: Array<[string, RegExp]> = [
  ["imports or mocks next/font/google", /["']next\/font\/google["']/],
  ["names fonts.googleapis.com", /fonts\.googleapis\.com/i],
  ["names fonts.gstatic.com", /fonts\.gstatic\.com/i],
];

/**
 * Blank out comments, keeping line breaks so line numbers still point at the
 * real line. `//` counts as a comment only when it is not part of a URL scheme.
 */
function stripComments(text: string, ext: string): string {
  if (ext === ".json" || ext === ".html" || ext === "") return text;
  const noBlock = text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ""));
  return ext === ".css" ? noBlock : noBlock.replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (SKIP_DIRS.has(e) || EXCLUDED.has(p)) continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (EXTS.has(extname(p))) out.push(p);
  }
  return out;
}

function sourceFiles(): string[] {
  const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));
  for (const f of ROOT_FILES) {
    const p = join(ROOT, f);
    try {
      if (statSync(p).isFile()) files.push(p);
    } catch {
      // optional config file
    }
  }
  return files;
}

describe("no build-time or runtime dependency on Google Fonts", () => {
  it("scans the files that feed the build (non-vacuity)", () => {
    const rel = sourceFiles().map((f) => relative(ROOT, f));
    expect(rel).toContain(join("src", "app", "layout.tsx"));
    expect(rel).toContain(join("src", "app", "opengraph-image.tsx"));
    expect(rel).toContain("next.config.ts");
    expect(rel).toContain("Dockerfile");
    expect(rel.length).toBeGreaterThan(100);
  });

  it("no source file imports next/font/google or names a Google Fonts host", () => {
    const hits: string[] = [];
    for (const file of sourceFiles()) {
      const lines = stripComments(readFileSync(file, "utf8"), extname(file)).split("\n");
      lines.forEach((line, i) => {
        for (const [what, re] of FORBIDDEN) {
          if (re.test(line)) hits.push(`${relative(ROOT, file)}:${i + 1} ${what}`);
        }
      });
    }
    expect(hits, `Google Fonts dependency found — vendor the font instead (scripts/vendor-fonts.mjs):\n${hits.join("\n")}`).toEqual([]);
  });

  it("the root layout loads the vendored stylesheet, and only next/font/local remains", () => {
    const layout = readFileSync(join(ROOT, "src", "app", "layout.tsx"), "utf8");
    expect(layout).toMatch(/import\s+["']\.\.\/\.\.\/styles\/fonts\.css["']/);
    const fontImports = [...layout.matchAll(/from\s+["'](next\/font\/[a-z]+)["']/g)].map((m) => m[1]);
    expect(fontImports).toEqual(["next/font/local"]);
  });
});
