"use client";

import { useEffect } from "react";

/**
 * CHECK 3 (runtime) — verify in the live browser that the intended faces are
 * actually obtainable, and console.error if not.
 *
 * Checks 1 and 2 run before deploy. This one runs on the user's machine, where
 * the failure modes the other two cannot see actually happen: a webfont blocked
 * by a corporate proxy, a cache holding a truncated woff2, an extension that
 * strips @font-face. It reports; it never changes rendering.
 *
 * LOAD, THEN CHECK — NOT CHECK ALONE
 * ----------------------------------
 * document.fonts.check() answers "is this face loaded right now", not "can this
 * face be used". Noto Sans JP is delivered as ~120 unicode-range slices that are
 * fetched only when text needing them is laid out, so a bare check() on a kanji
 * probe returns false on a page that happens not to use those glyphs yet. The
 * first version of this file did exactly that and reported a failure on every
 * page load. So: load() the probe text first, then check().
 *
 * Probes use real Japanese rather than the default Latin "BESbwy" — a JA face
 * can be present while the slice covering a given kanji is missing, and a Latin
 * probe would not notice.
 *
 * IBM Plex Mono is deliberately NOT probed. It is Latin-only, used for figures
 * and labels; the defect this gate is about is the JA face, and the mono
 * stack's JA coverage comes from the same Noto Sans JP probed above (via the
 * --dxa-font-mono token), not from Plex.
 *
 * WHICH JA FALLBACK RESOLVED — the evidence we cannot generate ourselves
 * ----------------------------------------------------------------------
 * dxa-tokens.css declares three local()-only JA fallback faces (Apple /
 * Windows / Legacy). Only the Apple one can be verified on the machines this
 * project has; the Windows and Legacy faces can never be, because there is no
 * Windows host. So this check asks the browser which of the three actually
 * matched a local font, and logs the answer at console.info. A real
 * Japanese-locale Windows visitor's console is the only place that answer can
 * ever come from. It is info, not error: on macOS Windows/Legacy are *expected*
 * to be unmatched, and vice versa.
 *
 * FontFace.load() on a local() face settles fast — "loaded" if a local font
 * matched, rejects if none did. It is raced against a timeout anyway; an engine
 * that neither resolves nor rejects is reported as "timeout" rather than
 * hanging the check.
 */

const JA_PROBE = "地価人口齟齬";
const LATIN_PROBE = "UrbanOracle";

type Face = { label: string; cssVar: string; probe: string };

// Next form with THIS product's faces: Latin = Geist (--font-geist-sans),
// JA = Noto Sans JP under --font-noto-sans-jp — the loader added by the dxa-ui
// work, because before it the body chain was `Geist, "Geist Fallback"` and
// nothing else. The heading faces (Source Serif / Zen Old Mincho subsets) are
// the product's own and not probed: they have a JA face and a serif
// terminator, verified per glyph on production.
const FACES: Face[] = [
  { label: "Geist (latin)", cssVar: "--font-geist-sans", probe: LATIN_PROBE },
  { label: "Noto Sans JP (ja)", cssVar: "--font-noto-sans-jp", probe: JA_PROBE },
];

/** The local()-only fallback families declared in dxa-tokens.css, in stack order. */
const JA_FALLBACK_FAMILIES = [
  "DXA JA Fallback Apple",
  "DXA JA Fallback Windows",
  "DXA JA Fallback Legacy",
] as const;

const FALLBACK_PROBE_TIMEOUT_MS = 3000;

/** True iff a stylesheet-declared FontFace with this family is loaded. */
function delivered(family: string): boolean {
  const fam = family.trim().replace(/^["']|["']$/g, "");
  let n = 0;
  document.fonts.forEach((f) => {
    if (f.family.replace(/^["']|["']$/g, "") === fam && f.status === "loaded") n++;
  });
  return n > 0;
}

type FallbackOutcome = "loaded" | "unmatched" | "timeout" | "not-declared";

async function probeFallback(family: string): Promise<FallbackOutcome> {
  let face: FontFace | null = null;
  document.fonts.forEach((f) => {
    if (f.family.replace(/^["']|["']$/g, "") === family) face = f;
  });
  if (!face) return "not-declared";
  const timeout = new Promise<FallbackOutcome>((res) =>
    setTimeout(() => res("timeout"), FALLBACK_PROBE_TIMEOUT_MS),
  );
  const load = (face as FontFace)
    .load()
    .then((): FallbackOutcome => "loaded")
    .catch((): FallbackOutcome => "unmatched");
  return Promise.race([load, timeout]);
}

export function FontRuntimeCheck() {
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        await document.fonts.ready;
      } catch {
        return;
      }
      if (cancelled) return;

      const root = getComputedStyle(document.documentElement);
      const failures: string[] = [];

      for (const face of FACES) {
        const family = root.getPropertyValue(face.cssVar).trim();
        if (!family) {
          failures.push(
            `${face.label}: ${face.cssVar} is not defined — next/font did not run, ` +
              `or the .variable class is missing from <html>`,
          );
          continue;
        }

        // Primary family only; the second entry is next/font's generic fallback,
        // which is always "available" and would mask a real miss.
        const primary = family.split(",")[0].trim();

        try {
          await document.fonts.load(`16px ${primary}`, face.probe);
        } catch (err) {
          failures.push(`${face.label}: could not load ${primary} — ${String(err)}`);
          continue;
        }
        if (cancelled) return;

        let ok = false;
        try {
          ok = document.fonts.check(`16px ${primary}`, face.probe);
        } catch (err) {
          failures.push(`${face.label}: fonts.check threw for ${primary} — ${String(err)}`);
          continue;
        }
        if (!ok) {
          failures.push(
            `${face.label}: ${primary} unavailable for ${JSON.stringify(face.probe)} ` +
              `even after an explicit load — the webfont did not arrive`,
          );
          continue;
        }
        // DELIVERY GUARD. document.fonts.check() returns TRUE when NO
        // @font-face for the family exists at all, so a variable that names a
        // face nothing declares passes the check above. Also require a loaded
        // FontFace with this family in document.fonts (next/font declares one
        // per delivered face; system fonts never appear there).
        if (!delivered(primary)) {
          failures.push(
            `${face.label}: ${primary} is named by ${face.cssVar} but no @font-face for it ` +
              `was delivered (no loaded FontFace with that family in document.fonts)`,
          );
        }
      }

      // The token itself must have survived var() substitution, or the whole
      // font-family declaration was dropped and everything above is moot.
      const token = root.getPropertyValue("--dxa-font-sans").trim();
      if (!token) {
        // Empty means either the token file never loaded, or a bridge variable
        // is undefined — var() on an undefined property is invalid at
        // computed-value time and the whole declaration resolves to nothing.
        const bridge = ["--dxa-face-latin", "--dxa-face-ja", "--dxa-face-mono"]
          .filter((v) => !root.getPropertyValue(v).trim());
        failures.push(
          bridge.length > 0
            ? `--dxa-font-sans is empty — bridge variable(s) undefined: ${bridge.join(", ")}`
            : "--dxa-font-sans is empty — dxa-tokens.css was not imported",
        );
      } else if (token.includes("--dxa-face-")) {
        failures.push(
          `--dxa-font-sans still contains an unresolved bridge variable (${token}) — ` +
            `--dxa-face-latin/ja/mono are not defined`,
        );
      }

      if (!cancelled && failures.length > 0) {
        console.error(
          `[dxa-ui] font check failed (${failures.length}). Japanese text may be ` +
            `rendering in an unintended face:\n  - ${failures.join("\n  - ")}`,
        );
      }

      // Which JA fallback face matched a local font on THIS machine. Info-level:
      // exactly one is expected to match per platform, the others to be
      // unmatched. This line is the only evidence the Windows/Legacy faces
      // will ever produce.
      const outcomes: string[] = [];
      let resolved: string | null = null;
      for (const family of JA_FALLBACK_FAMILIES) {
        const outcome = await probeFallback(family);
        if (cancelled) return;
        outcomes.push(`${family.replace("DXA JA Fallback ", "")}=${outcome}`);
        if (outcome === "loaded" && resolved === null) resolved = family;
      }
      console.info(
        `[dxa-ui] JA fallback resolved: ${resolved ?? "none"} ` +
          `(${outcomes.join(", ")}; platform=${navigator.platform || "unknown"}, ` +
          `lang=${navigator.language})`,
      );
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
