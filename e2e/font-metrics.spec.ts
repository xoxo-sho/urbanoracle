/**
 * CHECK 2 (metrics, primary) + CHECK 3 (runtime console) — prove that Japanese
 * text actually RENDERS in Noto Sans JP on UrbanOracle, and that the in-page
 * runtime check reports clean.
 *
 * WHY THIS SURFACE NEEDED IT MOST
 * -------------------------------
 * Before this work the body chain was `Geist, "Geist Fallback"` — nothing
 * after it. Delivered what it named (DELIVERY-AUDIT), named NO Japanese face
 * for 621 JA characters on the LP, and had NO generic terminator. Three
 * independent properties — delivered, named-for-content, terminated — and
 * only the first had ever been measured. The dxa-ui token supplies all three.
 *
 * NEXT FORM + `@theme inline` — HOW VERIFICATION DIFFERS HERE
 * ------------------------------------------------------------
 * The bridge holds next/font variables (--dxa-face-ja = var(--font-noto-sans-jp),
 * computed `"Noto Sans JP", "Noto Sans JP Fallback"`); every bridge value is
 * reduced to its PRIMARY family before use. AND this surface's Tailwind theme
 * is `@theme inline`: Tailwind inlines the theme keys into the utilities and
 * does NOT reliably emit --font-sans / --font-mono as runtime variables (on
 * the pre-change production build they computed to the empty string). So:
 *   - nothing here reads --font-sans or --font-mono;
 *   - every assertion about "what the page uses" reads the EFFECTIVE
 *     font-family on html / body / .font-mono elements;
 *   - the dxa variables (--dxa-font-sans, --dxa-face-*) are read because they
 *     are real :root variables from the token file and the bridge, not theme
 *     keys — and one test asserts body's effective stack EQUALS the computed
 *     --dxa-font-sans, which is the inline-theme-proof statement of "routed".
 * parallel_urban is also v4 but its @theme is NOT inline; its spec's
 * assertions were carried over only where they read elements or dxa vars.
 *
 * WHAT IS ASSERTED
 * ----------------
 *   1. Bridge + tokens present/substituted; JA primary is literally
 *      "Noto Sans JP" (Next 16 emits plain family names — checked, not
 *      assumed); html AND body effective stacks carry the token chain;
 *      body effective stack === computed --dxa-font-sans (inline-theme proof).
 *   2. JA via var(--dxa-font-sans): a loaded FontFace for Noto exists.
 *   3. Latin via the token == forced Geist, and Geist was delivered.
 *   4. JA via var(--dxa-font-mono) -> Noto, and the LP's JA .font-mono cell
 *      ("2024年") effectively renders through the mono token.
 *   5. The heading face is NOT touched by this work and must stay delivered:
 *      h1 primary = sourceSerif, a loaded FontFace exists (the product's own
 *      serif display stack, JA via Zen Old Mincho subset, serif terminator).
 *   6. Tofu + level-2 kanji; 7. Apple face (macOS); 8. check 3 console —
 *      CI-observable: the structural build's placeholder NEXT_PUBLIC_* mount
 *      the tree (firebase.ts also has hardcoded fallbacks).
 *
 * STANDING NOTE — JA width equality is Latin-strength evidence only (every
 * CJK glyph is 1 em); the document.fonts delivery guard and the Apple-face
 * line box carry the JA assertion. (dxa-ui docs §3.3.)
 *
 * LOCALE — JA-only UI, <html lang="ja"> hardcoded; use.locale ja-JP anyway so
 * the context matches production captures.
 *
 * ENVIRONMENT LIMITS — ubuntu CI has no Hiragino / Yu Gothic: the Apple test
 * self-skips, Windows/Legacy faces are never exercised anywhere.
 *
 * BASELINE NOTE — production answers HEAD probes (Next router prefetch) with
 * 405 from backend/core/spa.py; one console.error per page, pre-existing,
 * unrelated to fonts (recorded before this change). The local static server
 * used here does not reproduce it.
 */

import { expect, test } from "@playwright/test";

/** Fixed sample. 齟 U+9F5F, 齬 U+9F6C, 鬱 U+9B31 are JIS X 0208 level-2 kanji. */
const JA_SAMPLE = "都市の資産価値：齟齬なき閾値と鬱蒼たる樹林";
/** Latin sample with wide/narrow glyphs so face substitution shows in width. */
const LATIN_SAMPLE = "UrbanOracle — upside and downside Wmiljy 0123";
/**
 * JA as it appears in .font-mono cells (unit and labels). JA-ONLY on purpose:
 * the equality below compares the mono token against forced Noto, and any
 * Latin/digit in the sample would legitimately differ (mono digits in
 * JetBrains Mono / IBM Plex Mono vs Noto's proportional ones) and mask the
 * JA comparison. Digits are covered by the Latin test's family, not this one.
 */
const MONO_JA_SAMPLE = "年地価人口密度齟齬";

/**
 * Widths are bit-identical when both stacks land on the same face — the same
 * engine lays the same text out twice at the same size. 0.5px absorbs subpixel
 * rounding without being loose enough to hide a substitution: across a string
 * this long the nearest system face differs by whole pixels.
 */
const WIDTH_TOLERANCE_PX = 0.5;
const MEASURE_PX = 32;

/** Injected into the page; loads the faces a stack needs before measuring. */
const HELPERS = `
  // Primary family of a bridge value: "A", "B" -> A. Handles both the literal
  // Vite form and next/font's "primary, fallback" pair.
  window.__dxaPrimary = (family) =>
    String(family).split(",")[0].trim().replace(/^["']|["']$/g, "");
  // True iff a stylesheet-declared FontFace with this (primary) family is
  // present and loaded — i.e. the face was DELIVERED, not merely named or
  // locally present. System fonts never appear in document.fonts.
  window.__dxaDelivered = async (family, text, px) => {
    const fam = window.__dxaPrimary(family);
    try { await document.fonts.load(px + 'px "' + fam + '"', text); } catch (e) {}
    await document.fonts.ready;
    let n = 0;
    document.fonts.forEach((f) => {
      if (f.family.replace(/^["']|["']$/g, "") === fam && f.status === "loaded") n++;
    });
    return n;
  };
  window.__dxaMeasure = async (fontFamily, text, px) => {
    const el = document.createElement("span");
    el.textContent = text;
    el.style.cssText = [
      "position:absolute","visibility:hidden","white-space:pre","left:-99999px",
      "font-size:" + px + "px","font-weight:400","letter-spacing:0",
      "line-height:normal","font-family:" + fontFamily,
    ].join(";");
    document.body.appendChild(el);
    // Load the faces this element will actually use BEFORE measuring, or the
    // measurement races the unicode-range slice fetch and reports the
    // fallback. (1) fonts.load() with a var() in the shorthand is not valid
    // CSS and silently no-ops — so read the COMPUTED family list and load
    // those; (2) fonts.load() on the whole stack never settles when a
    // local()-only face is unmatched (the Windows face on macOS), so load each
    // family separately, each raced against a timeout, ignoring failures.
    const fams = getComputedStyle(el).fontFamily.split(",").map((f) => f.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    await Promise.all(fams.map((fam) => Promise.race([
      document.fonts.load(px + 'px "' + fam + '"', text).catch(() => {}),
      new Promise((res) => setTimeout(res, 1500)),
    ])));
    await document.fonts.ready;
    const r = el.getBoundingClientRect();
    el.remove();
    return { width: r.width, height: r.height };
  };
`;

/** Compare two font-family lists ignoring quoting/whitespace differences. */
const normalize = (v: string) =>
  v.split(",").map((f) => f.trim().replace(/^["']|["']$/g, "").toLowerCase()).join(",");

/** Console lines the runtime check (check 3) emits; captured per test. */
type Captured = { dxaLines: string[]; errors: string[] };

test.describe("font metrics — JA renders in the intended face (urbanoracle)", () => {
  let captured: Captured;

  test.beforeEach(async ({ page }) => {
    // Entry /: the LP carries 621 JA chars, the JA .font-mono cells (2024年)
    // and the h1; networkidle is reachable on the static server.
    const entry = "/";
    captured = { dxaLines: [], errors: [] };
    page.on("console", (msg) => {
      const text = msg.text();
      if (text.includes("[dxa-ui]")) captured.dxaLines.push(`${msg.type()}: ${text}`);
      if (msg.type() === "error") captured.errors.push(text);
    });
    await page.goto(entry, { waitUntil: "networkidle" });
    await page.addScriptTag({ content: HELPERS });
    await page.evaluate(() => document.fonts.ready);
  });

  test("bridge and token are present and substituted", async ({ page }) => {
    const r = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const p = (window as any).__dxaPrimary;
      return {
        latin: root.getPropertyValue("--dxa-face-latin").trim(),
        ja: root.getPropertyValue("--dxa-face-ja").trim(),
        mono: root.getPropertyValue("--dxa-face-mono").trim(),
        sans: root.getPropertyValue("--dxa-font-sans").trim(),
        monoToken: root.getPropertyValue("--dxa-font-mono").trim(),
        jaPrimary: p(root.getPropertyValue("--dxa-face-ja")),
        htmlFamily: getComputedStyle(document.documentElement).fontFamily,
        bodyFamily: getComputedStyle(document.body).fontFamily,
      };
    });
    // Custom properties are substituted at computed-value time, so the
    // computed tokens hold resolved family names, not var() references.
    expect(r.latin, "--dxa-face-latin is empty — bridge missing").not.toBe("");
    expect(r.ja, "--dxa-face-ja is empty — bridge missing").not.toBe("");
    expect(r.mono, "--dxa-face-mono is empty — bridge missing").not.toBe("");
    expect(r.sans, "--dxa-font-sans empty — token CSS not imported").toContain("DXA JA Fallback Apple");
    expect(r.monoToken, "--dxa-font-mono empty — token CSS not imported").toContain("DXA JA Fallback Apple");
    expect(r.sans, "unresolved bridge var in --dxa-font-sans").not.toContain("--dxa-face-");
    // Next 16 emits plain family names (checked, not assumed); the bridge's
    // primary is the literal "Noto Sans JP".
    expect(r.jaPrimary).toBe("Noto Sans JP");
    // EFFECTIVE values — this @theme is inline, so --font-sans/--font-mono are
    // not reliable runtime variables; what matters is what html (font-sans via
    // @apply) and body actually compute to.
    expect(r.htmlFamily, "html does not render through the dxa-ui token").toContain("DXA JA Fallback Apple");
    expect(r.bodyFamily, "body does not render through the dxa-ui token").toContain("DXA JA Fallback Apple");
    expect(r.bodyFamily).toContain("Noto Sans JP");
    // The strongest inline-theme statement of "routed": body's effective stack
    // IS the token's computed value, not merely a lookalike naming the same
    // family (the Fault-D discriminator per dxa-ui docs §5a).
    expect(normalize(r.bodyFamily)).toBe(normalize(r.sans));
    // Generic terminator present (the pre-change chain ended at "Geist Fallback").
    expect(r.bodyFamily.trim().endsWith("sans-serif")).toBe(true);
  });

  test("heading face untouched: h1 stays on the product's serif stack and it is delivered", async ({ page }) => {
    const r = await page.evaluate(async ({ px }) => {
      const h1 = document.querySelector("h1"); const fam = h1 ? getComputedStyle(h1).fontFamily : "";
      const primary = (window as any).__dxaPrimary(fam);
      const delivered = await (window as any).__dxaDelivered(primary, (h1?.textContent || "都市") + "都市", px);
      return { fam, primary, delivered, endsSerif: fam.trim().endsWith("serif") };
    }, { px: MEASURE_PX });
    expect(r.primary, "h1 primary face changed — the heading stack is out of scope and must not move").toBe("sourceSerif");
    expect(r.fam).toContain("zenOldMincho");
    expect(r.endsSerif, "heading stack must keep its serif terminator").toBe(true);
    expect(r.delivered, "sourceSerif is named on the h1 but no loaded FontFace exists").toBeGreaterThan(0);
  });

  test("var(--dxa-font-sans) resolves JA to the same face as forced Noto, and Noto was delivered", async ({
    page,
  }) => {
    const r = await page.evaluate(
      async ({ sample, px }) => {
        const root = getComputedStyle(document.documentElement);
        const m = (window as any).__dxaMeasure;
        const jaPrimary = (window as any).__dxaPrimary(root.getPropertyValue("--dxa-face-ja"));
        return {
          viaToken: (await m("var(--dxa-font-sans)", sample, px)).width,
          viaNoto: (await m(`"${jaPrimary}"`, sample, px)).width,
          viaSystemUi: (await m("system-ui", sample, px)).width,
          deliveredJa: await (window as any).__dxaDelivered(root.getPropertyValue("--dxa-face-ja"), sample, px),
          jaPrimary,
        };
      },
      { sample: JA_SAMPLE, px: MEASURE_PX },
    );
    expect(r.viaToken, "sample measured 0px — nothing rendered").toBeGreaterThan(0);
    expect(
      Math.abs(r.viaToken - r.viaNoto),
      `JA via --dxa-font-sans (${r.viaToken}px) != forced ${r.jaPrimary} (${r.viaNoto}px) — ` +
        `the stack silently resolved to something else.`,
    ).toBeLessThanOrEqual(WIDTH_TOLERANCE_PX);
    // Non-vacuity: the JA face must have been DELIVERED — a loaded FontFace
    // with that family exists in document.fonts. If not, both sides of the
    // width comparison above fell back to the same system font and agreed
    // while proving nothing (declared, never loaded).
    expect(
      r.deliveredJa,
      `${r.jaPrimary} is named in the bridge but no loaded FontFace with that family exists — ` +
        `never delivered; the width match above is vacuous. (system-ui ${r.viaSystemUi}px, ` +
        `token ${r.viaToken}px — that comparison is NOT the guard, see header.)`,
    ).toBeGreaterThan(0);
  });

  test("Latin via var(--dxa-font-sans) resolves to the product's own Latin face, delivered", async ({
    page,
  }) => {
    const r = await page.evaluate(
      async ({ sample, px }) => {
        const root = getComputedStyle(document.documentElement);
        const m = (window as any).__dxaMeasure;
        const latinPrimary = (window as any).__dxaPrimary(root.getPropertyValue("--dxa-face-latin"));
        return {
          viaToken: (await m("var(--dxa-font-sans)", sample, px)).width,
          viaLatin: (await m(`"${latinPrimary}"`, sample, px)).width,
          viaSystemUi: (await m("system-ui", sample, px)).width,
          deliveredLatin: await (window as any).__dxaDelivered(root.getPropertyValue("--dxa-face-latin"), sample, px),
          latinPrimary,
        };
      },
      { sample: LATIN_SAMPLE, px: MEASURE_PX },
    );
    expect(r.viaToken).toBeGreaterThan(0);
    expect(
      Math.abs(r.viaToken - r.viaLatin),
      `Latin via --dxa-font-sans (${r.viaToken}px) != forced ${r.latinPrimary} (${r.viaLatin}px)`,
    ).toBeLessThanOrEqual(WIDTH_TOLERANCE_PX);
    expect(
      r.deliveredLatin,
      `${r.latinPrimary} is named in the bridge but no loaded FontFace with that family exists — ` +
        `declared but never delivered. (token ${r.viaToken}px, system-ui ${r.viaSystemUi}px — not the guard.)`,
    ).toBeGreaterThan(0);
  });

  test("var(--dxa-font-mono) ALSO resolves JA to Noto — the mono stack had no JA face before", async ({
    page,
  }) => {
    // .font-mono renders Japanese here: the LP's year cells read "2024年"
    // (page.tsx {year}). The pre-change stack was `"Geist Mono", "Geist Mono
    // Fallback"` — no CJK face, no terminator. With @theme inline the utility
    // carries var(--dxa-font-mono) inlined, so the ELEMENT's effective family
    // is what is asserted below, not a --font-mono variable.
    const r = await page.evaluate(
      async ({ sample, px }) => {
        const root = getComputedStyle(document.documentElement);
        const m = (window as any).__dxaMeasure;
        const jaPrimary = (window as any).__dxaPrimary(root.getPropertyValue("--dxa-face-ja"));
        const monoPrimary = (window as any).__dxaPrimary(root.getPropertyValue("--dxa-face-mono"));
        const monoEl = [...document.querySelectorAll(".font-mono")].find((e) => /[぀-ゟ゠-ヿ一-鿿]/.test(e.textContent || "")) ?? document.querySelector(".font-mono");
        return {
          viaMonoToken: (await m("var(--dxa-font-mono)", sample, px)).width,
          viaNoto: (await m(`"${jaPrimary}"`, sample, px)).width,
          monoToken: root.getPropertyValue("--dxa-font-mono").trim(),
          monoPrimary,
          jaPrimary,
          // What a real .font-mono element on the page computes to, if any is
          // present on the entry screen (the login screen may have none).
          monoElFamily: monoEl ? getComputedStyle(monoEl).fontFamily : null,
        };
      },
      { sample: MONO_JA_SAMPLE, px: MEASURE_PX },
    );
    expect(r.monoToken).toContain(r.jaPrimary);
    expect(r.monoToken.split(",")[0].replace(/["']/g, "").trim()).toBe(r.monoPrimary);
    expect(
      Math.abs(r.viaMonoToken - r.viaNoto),
      `JA via --dxa-font-mono (${r.viaMonoToken}px) != forced ${r.jaPrimary} (${r.viaNoto}px)`,
    ).toBeLessThanOrEqual(WIDTH_TOLERANCE_PX);
    if (r.monoElFamily !== null) {
      // The JA mono cell's EFFECTIVE family must be the mono token's chain
      // (inline theme: no variable to read — read the element).
      expect(r.monoElFamily, ".font-mono element does not compute to the dxa-ui mono token").toContain(
        "DXA JA Fallback Apple",
      );
      expect(r.monoElFamily).toContain(r.jaPrimary);
    }
  });

  test("no sample glyph renders as U+25A0 tofu", async ({ page }) => {
    const r = await page.evaluate(
      async ({ sample, px }) => {
        const root = getComputedStyle(document.documentElement);
        const family = root.getPropertyValue("--dxa-font-sans").trim();
        // Load only the Noto primary family, not the whole stack: the stack
        // names "DXA JA Fallback Windows", whose local() sources do not exist
        // on macOS, and document.fonts.load never settles for an unmatchable
        // family — it hangs rather than rejecting.
        const notoPrimary = (window as any).__dxaPrimary(root.getPropertyValue("--dxa-face-ja"));
        try {
          await document.fonts.load(`${px}px "${notoPrimary}"`, sample + "■");
        } catch (e) {}
        await document.fonts.ready;

        const canvas = document.createElement("canvas");
        canvas.width = 2048;
        canvas.height = px * 2;
        const ctx = canvas.getContext("2d")!;
        const raster = (text: string) => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.font = `${px}px ${family}`;
          ctx.textBaseline = "top";
          ctx.fillStyle = "#000";
          ctx.fillText(text, 0, 0);
          const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          let h = 2166136261;
          for (let i = 3; i < d.length; i += 4) {
            h ^= d[i];
            h = Math.imul(h, 16777619);
          }
          return h >>> 0;
        };
        const tofuHash = raster("■");
        return {
          sampleHash: raster(sample),
          allTofuHash: raster("■".repeat([...sample].length)),
          tofuChars: [...sample].filter((ch) => ch !== "■" && raster(ch) === tofuHash),
        };
      },
      { sample: JA_SAMPLE, px: MEASURE_PX },
    );
    expect(
      r.sampleHash,
      "the JA sample rasterised identically to a string of U+25A0 — every glyph is tofu",
    ).not.toBe(r.allTofuHash);
    expect(r.tofuChars, `these characters rasterised identically to U+25A0: ${r.tofuChars.join(" ")}`).toEqual([]);
  });

  test("level-2 kanji specifically are covered", async ({ page }) => {
    // 齟 齬 鬱 閾 sit outside the common subset; a partial JA font passes a
    // naive hiragana check and still tofus these.
    const missing = await page.evaluate(async () => {
      const root = getComputedStyle(document.documentElement);
      const family = root.getPropertyValue("--dxa-font-sans").trim();
      const chars = ["齟", "齬", "鬱", "閾"];
      const notoPrimary = (window as any).__dxaPrimary(root.getPropertyValue("--dxa-face-ja"));
      try {
        await document.fonts.load(`32px "${notoPrimary}"`, chars.join("") + "■");
      } catch (e) {}
      await document.fonts.ready;
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 64;
      const ctx = canvas.getContext("2d")!;
      const raster = (t: string) => {
        ctx.clearRect(0, 0, 128, 64);
        ctx.font = `32px ${family}`;
        ctx.textBaseline = "top";
        ctx.fillText(t, 0, 0);
        const d = ctx.getImageData(0, 0, 128, 64).data;
        let h = 2166136261;
        for (let i = 3; i < d.length; i += 4) {
          h ^= d[i];
          h = Math.imul(h, 16777619);
        }
        return h >>> 0;
      };
      const tofu = raster("■");
      return chars.filter((c) => raster(c) === tofu);
    });
    expect(missing, `JIS level-2 kanji rendered as tofu: ${missing.join(" ")}`).toEqual([]);
  });

  test("macOS only — DXA JA Fallback Apple carries the measured overrides", async ({ page }) => {
    test.skip(process.platform !== "darwin", "Hiragino is only present on macOS; on CI this face never resolves");
    const m = await page.evaluate(
      async ({ px }) => {
        const measure = (window as any).__dxaMeasure;
        const notoPrimary = (window as any).__dxaPrimary(
          getComputedStyle(document.documentElement).getPropertyValue("--dxa-face-ja"),
        );
        return {
          tuned: await measure('"DXA JA Fallback Apple"', "地価", px),
          bare: await measure('"Hiragino Sans W3"', "地価", px),
          noto: await measure(`"${notoPrimary}"`, "地価", px),
          notoPrimary,
        };
      },
      { px: MEASURE_PX },
    );
    expect(m.notoPrimary, "--dxa-face-ja is empty").not.toBe("");
    // size-adjust:100% — advance must be untouched relative to bare Hiragino.
    expect(
      Math.abs(m.tuned.width - m.bare.width),
      "size-adjust:100% must leave JA advance identical to bare Hiragino",
    ).toBeLessThanOrEqual(WIDTH_TOLERANCE_PX);
    // The point of the overrides: the tuned face must report NOTO's line box,
    // not Hiragino's. Landing on bare Hiragino's value means local() failed to
    // match and the descriptors were silently dropped — the original defect.
    expect(
      m.tuned.height,
      `tuned line box ${m.tuned.height}px must match Noto's ${m.noto.height}px. ` +
        `Bare Hiragino is ${m.bare.height}px; landing there means local() did not ` +
        `match and the ascent/descent overrides were dropped.`,
    ).toBeCloseTo(m.noto.height, 0);
  });

  test("check 3 — the runtime font check ran on this page and reported clean", async ({ page }) => {
    // The FontRuntimeCheck component (src/app/font-runtime-check.tsx, mounted
    // in the root layout beside AuthProvider, so it runs on every route) always ends with an
    // info line naming which JA fallback face matched a local font. Its
    // presence proves the tree mounted and the check ran; the absence of the
    // failure line proves it found the token, the bridge and the JA face.
    // Wait for it: the check awaits document.fonts.ready and three FontFace
    // probes (each raced against 3 s), so it can land after networkidle.
    await expect
      .poll(() => captured.dxaLines.some((l) => l.includes("[dxa-ui] JA fallback resolved:")), {
        timeout: 15_000,
        message:
          "no `[dxa-ui] JA fallback resolved:` console line — the runtime check did not run " +
          "(tree did not mount, or the component is not in the layout)",
      })
      .toBe(true);
    const failed = captured.dxaLines.filter((l) => l.includes("[dxa-ui] font check failed"));
    expect(failed, `runtime check reported failure:\n${failed.join("\n")}`).toEqual([]);
    // Evidence: which fallback resolved on this machine (Apple on macOS;
    // "none" on ubuntu CI — both are correct answers, so this is not asserted).
    const resolved = captured.dxaLines.find((l) => l.includes("JA fallback resolved:"));
    test.info().annotations.push({ type: "dxa-ui runtime", description: resolved ?? "(none)" });
  });
});
