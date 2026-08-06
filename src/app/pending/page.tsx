"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sendEmailVerification } from "firebase/auth";
import { useAuth } from "@/lib/auth-context";
import { firebaseAuth } from "@/lib/firebase";

/**
 * メールアドレスの確認 — the last step of an open signup.
 *
 * Deliberately built on the same two-column editorial ground as /login: this is
 * a step inside the product, not a system notice. The earlier version read like
 * an error page, which framed a routine wait as something having gone wrong.
 *
 * Registration is open, so there is no review and nobody to wait for — only an
 * unopened message. The copy says exactly that and nothing more reassuring than
 * it can honestly promise.
 *
 * Mechanics are unchanged from the functional version:
 *   - a 15s poll, for the user who leaves this tab open;
 *   - an explicit re-check, for the user who returns and wants it now.
 * Both force-refresh the ID token before asking the backend to re-evaluate — a
 * cached token still carries email_verified:false and would report "still
 * pending" to someone who has just verified.
 *
 * Since activation now converges on any authenticated request, this screen is a
 * convenience rather than the only way through; a user who ignores it and
 * navigates back to /app is activated there instead.
 */

const POLL_INTERVAL_MS = 15_000;

export default function VerifyEmailPage() {
  const { user, refresh, getToken } = useAuth();
  const router = useRouter();
  const [resent, setResent] = useState(false);
  const [checking, setChecking] = useState(false);
  const [stillUnverified, setStillUnverified] = useState(false);
  const settled = useRef(false);

  const recheck = useCallback(async () => {
    if (settled.current) return false;
    const next = await refresh();
    if (!next?.emailVerified) return false;

    const token = await getToken(true);
    if (!token) return false;
    try {
      const res = await fetch("/api/v1/auth/re-evaluate", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return false;
    } catch {
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
    <main className="min-h-dvh grid lg:grid-cols-[1.1fr_1fr]">
      {/* Editorial ground — the same 深紺 field the sign-in page stands on. */}
      <section
        className="hidden lg:flex flex-col justify-between p-10"
        style={{ background: "var(--up-fill)" }}
      >
        <Link href="/" className="text-[11px] tracking-widest uppercase text-muted-foreground">
          UrbanOracle
        </Link>
        <div className="max-w-md">
          <h1 className="heading text-3xl leading-snug" style={{ color: "var(--up-text)" }}>
            あと一歩で、
            <br />
            計器が開きます。
          </h1>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            確認できたメールアドレスだけを受け入れています。審査はありません——
            リンクを開いた時点で、すべての機能がそのまま使えます。
          </p>
        </div>
        <p className="text-[10px] text-muted-foreground">
          一つのアカウントで DXA Labs の全プロダクトにアクセスできます。
        </p>
      </section>

      <section className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="w-full max-w-sm mx-auto">
          <p className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
            VERIFICATION
          </p>
          <h2 className="heading mt-2 text-2xl">メールアドレスの確認</h2>

          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
            確認メールをお送りしました。メール内のリンクを開くと認証が完了します。
          </p>

          {user?.email && (
            <p
              className="mt-3 rounded-sm border px-3 py-2 text-xs tabular-nums"
              style={{ borderColor: "var(--rule)", background: "var(--surface)" }}
            >
              {user.email}
            </p>
          )}

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
            className="mt-6 w-full rounded-sm px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "var(--up-text)" }}
          >
            {checking ? "確認しています…" : "認証を確認"}
          </button>

          {stillUnverified && (
            <p role="status" className="mt-3 text-[11px]" style={{ color: "var(--down-text)" }}>
              まだ認証を確認できません。メール内のリンクを開いてから、もう一度お試しください。
            </p>
          )}

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1" style={{ background: "var(--rule)" }} />
            <span className="text-[10px] text-muted-foreground">メールが届かない場合</span>
            <span className="h-px flex-1" style={{ background: "var(--rule)" }} />
          </div>

          <button
            type="button"
            onClick={async () => {
              const current = firebaseAuth().currentUser;
              if (!current) return;
              await sendEmailVerification(current).catch(() => undefined);
              setResent(true);
            }}
            className="w-full rounded-sm border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
          >
            {resent ? "確認メールを再送しました" : "確認メールを再送"}
          </button>

          <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
            迷惑メールフォルダもご確認ください。送信元は noreply@send.dxalabs.com です。
          </p>

          <p className="mt-8 pt-5 text-[10px] text-muted-foreground" style={{ borderTop: "1px solid var(--rule)" }}>
            <Link href="/" className="underline underline-offset-2 hover:text-foreground">
              UrbanOracle について
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
