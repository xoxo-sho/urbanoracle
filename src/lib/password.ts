/**
 * Password strength — since dxa-ui v0.3.0 a RE-EXPORT of the vendored
 * platform module (src/app/dxa/dxa-password.ts, byte-pinned by
 * check-dxa-drift). This file was the platform's reference for SHAPE
 * (checklist structure, canonical JA labels) — that shape is now the
 * vendored module's API, so nothing here changes for consumers.
 *
 * BEHAVIOUR CHANGE at the Unicode margin (RECON-C item B): the previous
 * local predicates used c.toLowerCase() + string-range compare, which
 * accepted İ (U+0130) and KELVIN K (U+212A) as "letters"; the canonical
 * codepoint predicates reject them. This binds SIGNUP and PASSWORD CHANGE
 * only — sign-in is deliberately ungated on every surface, so an existing
 * account with such a password still signs in.
 */
export {
  MIN_LENGTH,
  checkPassword,
  isPasswordAcceptable,
  type PasswordCheck,
} from "@/app/dxa/dxa-password";
