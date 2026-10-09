"use client";

import { useState } from "react";
import Link from "next/link";
import { sendPasswordResetEmail } from "firebase/auth";
import { authErrorCode, shouldDiscloseResetError, type AuthErrorCode } from "@/lib/auth-errors";
import { AUTH_COPY, AUTH_META, authErrorText } from "@/i18n/auth";
import { LanguageProvider, useLang } from "@/i18n/lang-context";
import { firebaseAuth } from "@/lib/firebase";

/**
 * Password reset — enumeration-safe (design-spec-v1 §6).
 *
 * An unregistered address and a registered one produce the SAME confirmation
 * screen. Firebase reports `auth/user-not-found`, and surfacing it would turn
 * this form into an oracle for "does this person have a DXA Labs account" —
 * which, on a shared tenant, leaks across every product at once.
 *
 * Only failures that say nothing about the address (rate limiting, malformed
 * input, network) are shown to the caller.
 */

export default function ForgotPasswordPage() {
  return (
    <LanguageProvider meta={AUTH_META}>
      <ForgotPasswordScreen />
    </LanguageProvider>
  );
}

function ForgotPasswordScreen() {
  const { lang } = useLang();
  const t = AUTH_COPY[lang];
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<AuthErrorCode | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await sendPasswordResetEmail(firebaseAuth(), email);
      setSent(true);
    } catch (err) {
      if (shouldDiscloseResetError(err)) {
        setError(authErrorCode(err));
      } else {
        // Includes auth/user-not-found: same screen as success, by design.
        setSent(true);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <p className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">{t.resetEyebrow}</p>

        {sent ? (
          <div data-testid="reset-confirmation">
            <h1 className="heading mt-2 text-2xl">{t.resetSentTitle}</h1>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              {t.resetSentBody}
            </p>
            <Link
              href="/login"
              className="mt-6 inline-block text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              {t.backToSignIn}
            </Link>
          </div>
        ) : (
          <>
            <h1 className="heading mt-2 text-2xl">{t.resetTitle}</h1>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              {t.resetIntro}
            </p>
            <form onSubmit={submit} className="mt-6 space-y-3">
              <label className="block">
                <span className="text-[11px] text-muted-foreground">{t.emailLabel}</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="mt-1 w-full rounded-sm border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                />
              </label>
              {error && (
                <p role="alert" className="text-[11px]" style={{ color: "var(--down-text)" }}>
                  {authErrorText(error, lang)}
                </p>
              )}
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-sm px-4 py-2.5 text-sm font-medium disabled:opacity-50"
                style={{ background: "var(--up-text)", color: "var(--background)" }}
              >
                {t.resetSubmit}
              </button>
            </form>
            <Link
              href="/login"
              className="mt-5 inline-block text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              {t.backToSignIn}
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
