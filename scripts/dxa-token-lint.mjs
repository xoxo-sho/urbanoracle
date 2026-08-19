/**
 * dxa-ui token lint — SELF-CONTAINED, pure. sync.mjs vendors this exact file
 * into each consuming repo as scripts/dxa-token-lint.mjs, and the repo's own
 * static font check imports it and runs it against the vendored
 * dxa-tokens.css. The same bytes therefore gate the source (sync refuses to
 * publish a violating file) and gate CI on every platform (the assertions
 * need no fonts installed — they read text).
 *
 * The rules exist because two things bit us that a platform-less check can
 * still catch:
 *
 *   RULE A — local() name forms.
 *     Chromium matches local() against FULL NAME and POSTSCRIPT NAME only.
 *     local("Hiragino Sans") silently matched nothing on macOS; the same is
 *     almost certainly true of local("Yu Gothic") on Windows, and there is no
 *     Windows machine to find out on. So every local() string must be a
 *     recognised full-name or PostScript-name form. A bare family name fails.
 *
 *   RULE B — descriptor strength follows evidence.
 *     A face marked DERIVED (not measured; unverifiable) may carry size-adjust
 *     ONLY. ascent-override / descent-override / line-gap-override are
 *     forbidden on it, because they depend on whether the engine reads hhea or
 *     OS/2 usWin for that font on that platform — unresolvable without the
 *     platform — and a wrong override degrades to visible misalignment where
 *     no override degrades to natural rendering. A face marked MEASURED must
 *     carry ascent-override and descent-override, or the measurement was
 *     pointless.
 *
 * Exports: lintTokenCss(cssText) → string[] of failure messages (empty = ok).
 */

/**
 * The only local() strings permitted in dxa-tokens.css. Each is a full-name
 * (name ID 4) or PostScript-name (name ID 6) form, or a localized full-name
 * form reported by a Japanese-locale name table.
 *
 * Adding a name here is a deliberate act: it must be a form that Chromium's
 * local() matcher will accept, and the justification belongs in the same
 * commit. Verified forms are marked; the rest were specified from name-table
 * convention and could not be checked on the platform that has the font.
 */
export const ALLOWED_LOCAL_NAMES = new Set([
  // Apple — VERIFIED on macOS 15 / Chromium 126: these match, the bare
  // family names "Hiragino Sans" / "Hiragino Kaku Gothic ProN" do not.
  "Hiragino Sans W3",
  "HiraginoSans-W3",
  "Hiragino Kaku Gothic ProN W3",
  "HiraKakuProN-W3",
  // Windows — UNVERIFIED (no Windows host). Full / PostScript forms for the
  // Medium and Regular weights, plus the localized FULL names a Japanese-
  // locale name table reports. A bare "游ゴシック" is deliberately absent: Yu
  // Gothic is a multi-style family (Regular and Medium coexist), so its
  // family name (ID 1 = 游ゴシック) can never equal the full name of any one
  // face (ID 4 = 游ゴシック Regular / 游ゴシック Medium). A bare 游ゴシック is a
  // localized FAMILY name — exactly what RULE A exists to reject. Where the
  // evidence is ambiguous, exclude: an excluded face is skipped and the stack
  // falls through; an included family name reintroduces bug #1.
  "Yu Gothic Medium",
  "YuGothic-Medium",
  "游ゴシック Medium",
  "Yu Gothic Regular",
  "YuGothic-Regular",
  "游ゴシック Regular",
  // Legacy — UNVERIFIED. The asymmetry with Yu Gothic above is deliberate,
  // not an oversight: Meiryo's regular face conventionally carries full name
  // == family name (ID 4 = "Meiryo"), because Meiryo Regular is the family's
  // canonical single style and there is no coexisting weight in the same
  // family to force a "Meiryo Regular" full name. So local("Meiryo") IS a
  // valid full-name form, and メイリオ is its localized counterpart. Yu Gothic
  // has no such coincidence, so it gets no bare entry.
  "Meiryo",
  "メイリオ",
]);

/**
 * Bare family names we know are wrong. Only used to make the failure message
 * say *why* — the allowlist above is what actually decides.
 */
export const KNOWN_BARE_FAMILY_NAMES = new Set([
  "Hiragino Sans",
  "Hiragino Kaku Gothic ProN",
  "Hiragino Kaku Gothic Pro",
  "Yu Gothic",
  "YuGothic",
  "Yu Gothic UI",
  "游ゴシック",
  "ヒラギノ角ゴシック",
]);

const OVERRIDE_DESCRIPTORS = ["ascent-override", "descent-override", "line-gap-override"];

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Split the file into @font-face blocks, each with the status marker that
 * immediately precedes it (only whitespace may sit between marker and rule).
 * Returns [{ family, status, statusRaw, body, index }].
 */
export function parseFontFaces(cssText) {
  const out = [];
  const re = /(?:\/\*\s*@dxa-face-status:\s*([A-Z]+)([^*]*)\*\/\s*)?@font-face\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(cssText)) !== null) {
    const body = m[3];
    const fam = body.match(/font-family\s*:\s*["']?([^"';]+)["']?\s*;/i);
    out.push({
      family: fam ? fam[1].trim() : "(unnamed)",
      status: m[1] ?? null,
      statusRaw: m[1] ? `${m[1]}${m[2] ?? ""}`.trim() : null,
      body,
      index: m.index,
    });
  }
  return out;
}

export function lintTokenCss(cssText) {
  const failures = [];
  const faces = parseFontFaces(cssText);

  if (faces.length === 0) {
    failures.push("no @font-face blocks found — expected the DXA JA Fallback faces");
    return failures;
  }

  for (const face of faces) {
    const tag = `@font-face "${face.family}"`;
    const body = stripComments(face.body);

    // ---- status marker present and recognised ----------------------------
    if (!face.status) {
      failures.push(
        `${tag}: missing status marker. Every face must be immediately preceded by\n` +
          `      /* @dxa-face-status: MEASURED ... */ or /* @dxa-face-status: DERIVED ... */`,
      );
    } else if (face.status !== "MEASURED" && face.status !== "DERIVED") {
      failures.push(`${tag}: unknown status "${face.status}" — must be MEASURED or DERIVED`);
    }

    // ---- src is local()-only, and every local() is an allowed name form --
    const src = body.match(/src\s*:\s*([^;]+);/i);
    if (!src) {
      failures.push(`${tag}: no src descriptor`);
    } else {
      if (/url\s*\(/i.test(src[1])) {
        failures.push(`${tag}: src contains url() — fallback faces must be local()-only`);
      }
      const locals = [...src[1].matchAll(/local\(\s*["']?([^"')]+?)["']?\s*\)/g)].map((x) => x[1].trim());
      if (locals.length === 0) {
        failures.push(`${tag}: src has no local() entries`);
      }
      for (const name of locals) {
        if (ALLOWED_LOCAL_NAMES.has(name)) continue;
        const why = KNOWN_BARE_FAMILY_NAMES.has(name)
          ? `"${name}" is a bare FAMILY name. Chromium's local() matches full names and ` +
            `PostScript names only — this entry will silently match nothing (bug #1).`
          : `"${name}" is not a recognised full-name / PostScript-name form. If it is one, ` +
            `add it to ALLOWED_LOCAL_NAMES in token-lint.mjs with the justification.`;
        failures.push(`${tag}: local(${JSON.stringify(name)}) rejected — ${why}`);
      }
    }

    // ---- RULE B: descriptors match evidence grade -------------------------
    const has = (d) => new RegExp(`(^|[;{\\s])${d}\\s*:`, "i").test(body);
    if (!has("size-adjust")) {
      failures.push(`${tag}: size-adjust is required on every fallback face`);
    }
    if (face.status === "DERIVED") {
      const present = OVERRIDE_DESCRIPTORS.filter(has);
      if (present.length > 0) {
        failures.push(
          `${tag}: is DERIVED (not measured, unverifiable) but declares ${present.join(", ")}.\n` +
            `      DERIVED faces may carry size-adjust ONLY. A wrong ascent/descent override on an\n` +
            `      unmeasured font degrades to visible misalignment; no override degrades to natural\n` +
            `      rendering. Remove the override(s), or measure the font and mark it MEASURED.`,
        );
      }
    } else if (face.status === "MEASURED") {
      const missing = ["ascent-override", "descent-override"].filter((d) => !has(d));
      if (missing.length > 0) {
        failures.push(
          `${tag}: is MEASURED but lacks ${missing.join(", ")} — a measured face must carry ` +
            `the overrides the measurement was taken to derive.`,
        );
      }
    }
  }

  return failures;
}
