import { authErrorText } from "@/i18n/auth";

/**
 * Firebase auth error → a code the screens turn into copy (design-spec-v1 §6).
 *
 * The words live in src/i18n/auth.ts, in the visitor's language; this module
 * only decides which message an error deserves. The messages are written for
 * the person reading them, not for the console. In particular
 * `auth/email-already-in-use` has to explain a consequence of the shared
 * dxalabs-platform tenant: the address is registered because the person
 * already has a DXA Labs account somewhere else, and the fix is to sign in
 * rather than to pick a different address.
 */

export type AuthErrorCode =
  | "too-many-requests"
  | "invalid-email"
  | "email-already-in-use"
  | "invalid-credential"
  | "user-disabled"
  | "weak-password"
  | "popup-closed-by-user"
  | "popup-blocked"
  | "network-request-failed"
  | "unknown";

const CODES: Record<string, AuthErrorCode> = {
  "auth/too-many-requests": "too-many-requests",
  "auth/invalid-email": "invalid-email",
  "auth/email-already-in-use": "email-already-in-use",
  "auth/invalid-credential": "invalid-credential",
  "auth/wrong-password": "invalid-credential",
  "auth/user-disabled": "user-disabled",
  "auth/weak-password": "weak-password",
  "auth/popup-closed-by-user": "popup-closed-by-user",
  "auth/popup-blocked": "popup-blocked",
  "auth/network-request-failed": "network-request-failed",
};

/**
 * `auth/user-not-found` is deliberately absent: telling a caller that an
 * address is unregistered is an account-enumeration oracle. The reset flow
 * never surfaces it (see /forgot-password), and anywhere else it falls back
 * to the generic "unknown" message.
 */

/**
 * Codes the password-reset form may show, because they say nothing about
 * whether the address is registered.
 *
 * Everything else — `auth/user-not-found` above all — resolves to the same
 * confirmation screen as success. On a shared tenant, an "unknown address"
 * message would leak account existence across every DXA Labs product at once.
 */
const RESET_DISCLOSABLE = new Set([
  "auth/too-many-requests",
  "auth/invalid-email",
  "auth/network-request-failed",
]);

export function errorCodeOf(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : "";
}

/** False means: show the confirmation screen, regardless of what happened. */
export function shouldDiscloseResetError(error: unknown): boolean {
  return RESET_DISCLOSABLE.has(errorCodeOf(error));
}

/** The message code for any thrown value; unmapped and non-errors are "unknown". */
export function authErrorCode(error: unknown): AuthErrorCode {
  return CODES[errorCodeOf(error)] ?? "unknown";
}

/** The in-use message in Japanese (kept for callers that predate the codes). */
export const SHARED_TENANT_EMAIL_IN_USE = authErrorText("email-already-in-use", "ja");

/** The message in Japanese (kept for callers that predate the codes). */
export function authErrorMessage(error: unknown): string {
  return authErrorText(authErrorCode(error), "ja");
}
