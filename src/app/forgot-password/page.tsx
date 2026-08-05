"use client";

import { useState } from "react";
import Link from "next/link";
import { sendPasswordResetEmail } from "firebase/auth";
import { authErrorMessage, shouldDiscloseResetError } from "@/lib/auth-errors";
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
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        setError(authErrorMessage(err));
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
        <p className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">RESET</p>

        {sent ? (
          <div data-testid="reset-confirmation">
            <h1 className="heading mt-2 text-2xl">確認メールを送信しました</h1>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              入力されたメールアドレスが登録されている場合、パスワード再設定用のリンクをお送りしました。
              数分経っても届かない場合は、迷惑メールフォルダをご確認ください。
            </p>
            <Link
              href="/login"
              className="mt-6 inline-block text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              サインインに戻る
            </Link>
          </div>
        ) : (
          <>
            <h1 className="heading mt-2 text-2xl">パスワードの再設定</h1>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              ご登録のメールアドレスに再設定用のリンクをお送りします。
            </p>
            <form onSubmit={submit} className="mt-6 space-y-3">
              <label className="block">
                <span className="text-[11px] text-muted-foreground">メールアドレス</span>
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
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-sm px-4 py-2.5 text-sm font-medium disabled:opacity-50"
                style={{ background: "var(--up-text)", color: "var(--background)" }}
              >
                再設定リンクを送信
              </button>
            </form>
            <Link
              href="/login"
              className="mt-5 inline-block text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              サインインに戻る
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
