"use client";

import Link from "next/link";
import { SOURCES } from "@/lib/sources";

/**
 * 審査中 (design-spec-v1 §7).
 *
 * Reached only from a 403 carrying `pending_activation` — an authenticated,
 * provisioned person whose account is awaiting approval. The tone is quiet
 * authority, not rejection: nothing here apologises, hurries, or implies the
 * answer was no. 深紺 is the ground because it is the colour of expectation.
 */
export default function PendingPage() {
  return (
    <main className="min-h-dvh flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-lg">
        <div
          className="rounded-sm border p-8 sm:p-10"
          style={{ background: "var(--up-fill)", borderColor: "var(--surface-border)" }}
        >
          <p className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
            UNDER REVIEW
          </p>
          <h1 className="heading mt-3 text-2xl" style={{ color: "var(--up-text)" }}>
            アクセスを審査中です
          </h1>

          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
            ご登録ありがとうございます。UrbanOracle は不動産投資家・デベロッパー向けの
            意思決定計器として、利用者を個別に確認したうえでご案内しています。
          </p>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            審査が完了しましたら、ご登録のメールアドレス宛にご連絡いたします。
            このページを閉じていただいて構いません。
          </p>

          <div className="mt-7 pt-5" style={{ borderTop: "1px solid var(--rule)" }}>
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              一つのアカウントで DXA Labs の全プロダクトにアクセスできます。
            </p>
            <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
              収録データ: {SOURCES.reinfolib.label} ／ {SOURCES.estat.label} ／ {SOURCES.ksj.label}
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
