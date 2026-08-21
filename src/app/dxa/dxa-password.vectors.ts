/* dxa-ui v0.3.0 — DO NOT EDIT. Synced from dxa-ui/tokens. */

/**
 * THIS FILE IS THE SPECIFICATION, NOT A TEST SUITE.
 *
 * The "at least one letter" rule exists nowhere else on the platform: the
 * tenant floor enforces only length + a digit (console-read 2026-08-20), so
 * the vectors below are where the letter rule IS DEFINED. A test suite
 * checks an implementation against a spec that lives elsewhere; here there
 * is no elsewhere. Every surface's password test imports PASSWORD_SPEC_VECTORS
 * and runs them against the vendored module — one specification, executed on
 * every surface, byte-pinned by check-dxa-drift.
 *
 * Vectors 5–6 are the DIVERGENCE DETECTORS: the inputs that separated the
 * two predicate families nobody knew existed (RECON-C, measured in Node).
 * Their confusable characters are \u ESCAPES, never literals — enforced by
 * incident: the first draft of THIS FILE lost U+212A to an ASCII "K" in a
 * shell heredoc, visually identical, semantically nothing, and the authoring
 * proof caught it only because the module then accepted the vector. A spec
 * whose bytes cannot be eyeballed must be written so the bytes are explicit.
 * Surface suites should also pin the identities:
 *   expect([...kelvinVector.input][0].codePointAt(0)).toBe(0x212a);
 *   expect([...dottedIVector.input][0].codePointAt(0)).toBe(0x0130);
 * Vectors 9–10 are an ATTRIBUTION PAIR (FONT-LOADING.md §3.5): 6 codepoints
 * rejecting AND 8 accepting. Either alone is ambiguous — a lone reject could
 * be length failing for the expected reason or for one we did not expect;
 * the pair attributes the behaviour to codepoint counting itself.
 */

export interface PasswordSpecVector {
  input: string;
  expect: "accept" | "reject";
  /** which rule decides (for reject) / "all" (for accept) */
  rule: "length" | "letter" | "digit" | "all";
  why: string;
}

export const PASSWORD_SPEC_VECTORS: readonly PasswordSpecVector[] = [
  { input: "abcd1234", expect: "accept", rule: "all", why: "baseline" },
  { input: "パスワード1234", expect: "reject", rule: "letter", why: "Japanese chars are not letters" },
  { input: "password１２３４", expect: "reject", rule: "digit", why: "fullwidth digits are not digits" },
  { input: "ＡＢＣＤ1234", expect: "reject", rule: "letter", why: "fullwidth letters are not letters" },
  { input: "\u0130\u0130\u0130\u0130\u0130\u0130\u01301", expect: "reject", rule: "letter", why: "U+0130 LATIN CAPITAL I WITH DOT ABOVE (escape, not literal — confusables must be unambiguous in the spec): toLowerCase → 'i̇' sneaks past string-range compare — divergence detector" },
  { input: "\u212A\u212A\u212A\u212A\u212A\u212A\u212A1", expect: "reject", rule: "letter", why: "U+212A KELVIN SIGN (visually identical to K — hence the escape, never a literal): toLowerCase → 'k' — divergence detector" },
  { input: "ſſſſſſſ1", expect: "reject", rule: "letter", why: "U+017F: /[a-z]/iu would accept — guards against a regex regression" },
  { input: "ａｂｃｄ1234", expect: "reject", rule: "letter", why: "fullwidth lowercase: toLowerCase identity — pins a property both old families shared" },
  { input: "😀😀😀ab1", expect: "reject", rule: "length", why: "6 codepoints; UTF-16-unit counting (9) would wrongly accept — attribution pair, reject side" },
  { input: "😀😀😀😀😀😀a1", expect: "accept", rule: "all", why: "8 codepoints incl. letter+digit — attribution pair, accept side" },
  { input: "abcdef1", expect: "reject", rule: "length", why: "boundary: 7" },
  { input: "abcdefg1", expect: "accept", rule: "all", why: "boundary: 8" },
  { input: "ABCDEFG1", expect: "accept", rule: "all", why: "uppercase counts as a letter" },
  { input: "abcdefgh", expect: "reject", rule: "digit", why: "no digit" },
  { input: "12345678", expect: "reject", rule: "letter", why: "no letter" },
  { input: "aaaa٣٣٣٣", expect: "reject", rule: "digit", why: "Arabic-Indic digits are not digits — the \\d-class hazard the module comments name" },
] as const;
