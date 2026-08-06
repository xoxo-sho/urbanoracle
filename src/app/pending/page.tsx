"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sendEmailVerification } from "firebase/auth";
import { useAuth } from "@/lib/auth-context";
import { firebaseAuth } from "@/lib/firebase";

/**
 * メール確認 — the only reason an authenticated caller is not yet active.
 *
 * Registration is open. This screen used to say 審査中 ("under review") because
 * activation ran a five-layer curation rule; that rule is now a single check on
 * `email_verified`, so there is nothing to review and nobody to wait for. The
 * copy had to change with it: telling someone their access is "being reviewed"
 * when no review exists would leave them waiting for an email that never comes,
 * instead of opening the one already in their inbox.
 *
 * Reached from a 403 carrying `pending_activation` (see lib/api-gate.ts), which
 * now means exactly one thing: the address is unverified.
 *
 * Two ways out, because verification completes in a different tab and this page
 * cannot observe that directly:
 *   - a poll, for the user who leaves this open;
 *   - an explicit re-check, for the user who comes back and wants it now.
 * Both force-refresh the ID token before asking the backend to re-evaluate — a
 * cached token still carries `email_verified: false`, so re-evaluating against
 * it would report "still pending" to someone who has just verified.
 */

const POLL_INTERVAL_MS = 15_000;

export default function VerifyEmailPage() {
  const { user, refresh, getToken } = useAuth();
  const router = useRouter();
  const [resent, setResent] = useState(false);
  const [checking, setChecking] = useState(false);
  const [stillUnverified, setStillUnverified] = useState(false);
  const settled = useRef(false);

  /** Re-run the rule with a fresh token; on success land the user in /app. */
  const recheck = useCallback(async () => {
    if (settled.current) return false;
    const next = await refresh();
    if (!next?.emailVerified) return false;

    // Verified: force a token refresh so the claim is current, then ask the
    // backend to lift is_active false->true (re_evaluate is raise-only).
    const token = await getToken(true);
    if (!token) return false;
    try {
      const res = await fetch("/api/v1/auth/re-evaluate", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return false;
    } catch {
      // Network failure is not terminal: the next sign-in performs the same
      // upgrade through ensure_user, so we simply stay on this screen.
      return false;
    }
    settled.current = true;
    router.replace("/app");
    return true;
  }, [refresh, getToken, router]);

  useEffect(() => {
    const id = setInterval(() => void recheck(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [recheck]);

  return (
    <main className="min-h-dvh flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-lg">
        <div
          className="rounded-sm border p-8 sm:p-10"
          style={{ background: "var(--up-fill)", borderColor: "var(--surface-border)" }}
        >
          <p className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
            VERIFY YOUR EMAIL
          </p>
          <h1 className="heading mt-3 text-2xl" style={{ color: "var(--up-text)" }}>
            メールを確認してください
          </h1>

          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
            {user?.email ? `${user.email} 宛に` : "ご登録のメールアドレス宛に"}
            確認メールをお送りしました。メール内のリンクを開くと、認証が完了します。
          </p>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            認証が完了すると、そのままご利用いただけます。審査や承認の待ち時間はありません。
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={checking}
              onClick={async () => {
                setChecking(true);
                setStillUnverified(false);
                const ok = await recheck();
                if (!ok) setStillUnverified(true);
                setChecking(false);
              }}
              className="rounded-sm border px-4 py-2 text-[11px] disabled:opacity-60"
              style={{ borderColor: "var(--surface-border)", color: "var(--up-text)" }}
            >
              {checking ? "確認中…" : "認証を確認"}
            </button>

            <button
              type="button"
              onClick={async () => {
                const current = firebaseAuth().currentUser;
                if (!current) return;
                await sendEmailVerification(current).catch(() => undefined);
                setResent(true);
              }}
              className="text-[11px] underline underline-offset-2 text-muted-foreground hover:text-foreground"
            >
              {resent ? "確認メールを再送しました" : "確認メールを再送"}
            </button>
          </div>

          {stillUnverified && (
            <p role="status" className="mt-4 text-[11px] text-muted-foreground">
              まだ認証が確認できません。メール内のリンクを開いてから、もう一度お試しください。
            </p>
          )}

          <div className="mt-7 pt-5" style={{ borderTop: "1px solid var(--rule)" }}>
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              一つのアカウントで DXA Labs の全プロダクトにアクセスできます。
            </p>
          </div>
        </div>

        <Link
          href="/"
          className="mt-5 inline-block text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          UrbanOracle について
        </Link>
      </div>
    </main>
  );
}
