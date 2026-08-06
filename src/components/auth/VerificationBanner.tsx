"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sendEmailVerification } from "firebase/auth";
import { useAuth } from "@/lib/auth-context";
import { firebaseAuth } from "@/lib/firebase";

/**
 * Email-verification notice (design-spec-v1 §6).
 *
 * Verification gates nothing — the dashboard is fully usable while the
 * message sits unread. The banner only does two things: it polls for
 * completion, and when it sees completion it asks the backend to re-run the
 * activation rule.
 *
 * That second part is the upgrade path. Verification is the ONLY thing that
 * decides activation now, so a user who verifies should become active the
 * moment they do — without a re-login and without waiting on a review that no
 * longer exists. Without this call they would keep hitting /pending.
 *
 * This banner is the in-app case: an active user whose address is merely
 * unconfirmed. The full-screen sibling at /pending handles the other case —
 * not yet active *because* unverified — and is where a 403 lands.
 */

const POLL_INTERVAL_MS = 30_000;

export default function VerificationBanner() {
  const { user, refresh, getToken } = useAuth();
  const [resent, setResent] = useState(false);
  const [reevaluated, setReevaluated] = useState<string | null>(null);
  const triggered = useRef(false);

  const verified = user?.emailVerified ?? true;

  /** Ask the backend to re-run the 4-layer rule now that we are verified. */
  const triggerReEvaluation = useCallback(async () => {
    if (triggered.current) return;
    triggered.current = true;
    try {
      // Force-refresh so the token carries the updated email_verified claim;
      // a stale token would make the backend re-evaluate against the old one.
      const token = await getToken(true);
      if (!token) return;
      const res = await fetch("/api/v1/auth/re-evaluate", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const body = await res.json().catch(() => null);
        setReevaluated(body?.status ?? null);
      }
    } catch {
      // A failed re-evaluation is not user-facing: the account is unchanged
      // and the next sign-in performs the same upgrade via ensure_user.
      triggered.current = false;
    }
  }, [getToken]);

  useEffect(() => {
    if (verified) return;
    const id = setInterval(() => {
      void refresh().then((next) => {
        if (next?.emailVerified) void triggerReEvaluation();
      });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [verified, refresh, triggerReEvaluation]);

  // Self-dismissing: once verified there is nothing left to say.
  if (verified) return null;

  return (
    <div
      role="status"
      data-testid="verification-banner"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-[11px] md:px-6"
      style={{ background: "var(--up-fill)", borderColor: "var(--surface-border)" }}
    >
      <span style={{ color: "var(--up-text)" }}>メールアドレスの確認が未完了です。</span>
      <span className="text-muted-foreground">
        確認は機能の利用を妨げません。完了後、アクセス権が自動的に見直されます。
      </span>
      <button
        type="button"
        onClick={async () => {
          const current = firebaseAuth().currentUser;
          if (!current) return;
          await sendEmailVerification(current).catch(() => undefined);
          setResent(true);
        }}
        className="underline underline-offset-2 text-muted-foreground hover:text-foreground"
      >
        {resent ? "確認メールを再送しました" : "確認メールを再送"}
      </button>
      {reevaluated && <span className="sr-only">{reevaluated}</span>}
    </div>
  );
}
