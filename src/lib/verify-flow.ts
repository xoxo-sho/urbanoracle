/**
 * What the sign-in screens share for verifying an address (Stage 2,
 * 2026-10-25): /login leaves the one-shot flag; /pending consumes it and asks
 * UrbanOracle's backend for the mail; /auth/action asks for a new link. The
 * mail is UrbanOracle's own (POST /api/v1/auth/verification-email,
 * backend/routers/verification.py) — the client never asks Firebase to send
 * its own verification mail. Kept free of React.
 *
 * Ported in shape from Parti (frontend/lib/verify-flow.ts @origin/main) on
 * this product's own pieces: the reader's language from src/i18n/lang.ts
 * (urbanoracle.lang, ?lang=), and a plain fetch — deliberately NOT
 * lib/api-gate.ts, whose classifyResponse turns a 403 into a redirect to this
 * very screen and swallows the bodies the answers below live in.
 */
import { readStoredLang, resolveLang, type Lang } from "@/i18n/lang";
import { firebaseAuth } from "@/lib/firebase";

// ─── The one-shot auto-send flag ─────────────────────────────────────────────
//
// /login sets it immediately before the account is created (and removes it if
// creation throws), and where an unverified sign-in is routed to /pending.
// /pending removes it synchronously when the signed-in user is known and then
// asks for the mail once. A reload, or the 403 redirect to /pending, finds no
// flag and sends nothing. sessionStorage stays with the tab.

export const AUTO_SEND_FLAG = "urbanoracle.verify.autoSend";

export function setAutoSendFlag(): void {
  try {
    window.sessionStorage.setItem(AUTO_SEND_FLAG, "1");
  } catch {
    /* storage unavailable: the user can still press Resend */
  }
}

export function clearAutoSendFlag(): void {
  try {
    window.sessionStorage.removeItem(AUTO_SEND_FLAG);
  } catch {
    /* nothing to clear */
  }
}

/** True once per flag: reading it removes it. */
export function consumeAutoSendFlag(): boolean {
  try {
    if (window.sessionStorage.getItem(AUTO_SEND_FLAG) === null) return false;
    window.sessionStorage.removeItem(AUTO_SEND_FLAG);
    return true;
  } catch {
    return false;
  }
}

// ─── The mail's language ─────────────────────────────────────────────────────

/** The reader's language as the backend's `lang`: ?lang=, then urbanoracle.lang, Japanese by default. */
export function currentLang(): Lang {
  try {
    return resolveLang(window.location.search, readStoredLang());
  } catch {
    return "ja";
  }
}

// ─── The webmail shortcut ────────────────────────────────────────────────────

export type MailProviderId = "gmail" | "outlook" | "yahoo" | "icloud";

const MAIL_PROVIDERS: readonly { id: MailProviderId; url: string; domains: readonly string[] }[] = [
  {
    id: "gmail",
    // Opens a search for the sender across every folder, spam included.
    url: "https://mail.google.com/mail/u/0/#search/from%3Anoreply%40send.dxalabs.com+in%3Aanywhere",
    domains: ["gmail.com", "googlemail.com"],
  },
  {
    id: "outlook",
    url: "https://outlook.live.com/mail/0/",
    domains: ["outlook.com", "outlook.jp", "hotmail.com", "hotmail.co.jp", "live.com", "live.jp", "msn.com"],
  },
  { id: "yahoo", url: "https://mail.yahoo.co.jp/", domains: ["yahoo.co.jp", "ymail.ne.jp"] },
  { id: "icloud", url: "https://www.icloud.com/mail", domains: ["icloud.com", "me.com", "mac.com"] },
];

/** The webmail for the address's domain (lowercased), or null for any other domain. */
export function mailProviderFor(email: string | null | undefined): { id: MailProviderId; url: string } | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  const provider = MAIL_PROVIDERS.find((p) => p.domains.includes(domain));
  return provider ? { id: provider.id, url: provider.url } : null;
}

// ─── The request ─────────────────────────────────────────────────────────────

/** How the backend answered a request for the verification mail. */
export type VerificationEmailResult =
  | { kind: "sent"; retryAfter: number }
  | { kind: "cooldown"; retryAfter: number }
  | { kind: "daily_limit"; retryAfter: number }
  | { kind: "already_verified" };

export const ENDPOINT = "/api/v1/auth/verification-email";

/** A request the screens cannot act on: a 5xx, an unexpected 4xx, or no answer at all (status null). */
export class VerificationRequestError extends Error {
  readonly status: number | null;

  constructor(status: number | null, message: string) {
    super(message);
    this.name = "VerificationRequestError";
    this.status = status;
  }
}

/**
 * Ask UrbanOracle's backend to send the verification mail to the signed-in
 * (unverified) identity's own address, in `lang`, with the current ID token.
 * Resolves for every answer the screens act on; rejects with
 * VerificationRequestError on a 5xx, a network failure (status null), or
 * anything else — and without a request when nobody is signed in. Never a
 * redirect, never a sign-out: those belong to the data gates, not to this.
 */
export async function requestVerificationEmail(lang: Lang): Promise<VerificationEmailResult> {
  const user = firebaseAuth().currentUser;
  if (!user) throw new VerificationRequestError(401, "not signed in");

  let token: string;
  try {
    token = await user.getIdToken();
  } catch {
    throw new VerificationRequestError(null, "no ID token");
  }

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ lang }),
    });
  } catch {
    throw new VerificationRequestError(null, "network failure");
  }

  const body = (await response.json().catch(() => null)) as { detail?: unknown; retry_after?: unknown } | null;
  const detail = body?.detail;
  if (response.ok) return { kind: "sent", retryAfter: Number(body?.retry_after) || 60 };
  if (response.status === 429 && (detail === "cooldown" || detail === "daily_limit")) {
    return { kind: detail, retryAfter: Number(body?.retry_after) || 60 };
  }
  if (response.status === 409 && detail === "already_verified") return { kind: "already_verified" };
  throw new VerificationRequestError(response.status, `${ENDPOINT} answered ${response.status}`);
}
