"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { authErrorMessage } from "@/lib/auth-errors";
import { BUILD_SHA, firebaseAuth } from "@/lib/firebase";
import { checkPassword, isPasswordAcceptable } from "@/lib/password";

/**
 * Sign-in (design-spec-v1 §6).
 *
 * One screen, two providers, a mode toggle rather than tabs — tabs imply two
 * destinations, and there is only one: an account on the shared tenant.
 */

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const checks = checkPassword(password);
  const passwordReady = isPasswordAcceptable(password);

  async function withBusy(action: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const signInGoogle = () =>
    withBusy(async () => {
      await signInWithPopup(firebaseAuth(), new GoogleAuthProvider());
      router.push("/app");
    });

  const submitEmail = (event: React.FormEvent) => {
    event.preventDefault();
    return withBusy(async () => {
      if (mode === "signup") {
        if (!passwordReady) {
          setError("パスワードが要件を満たしていません");
          return;
        }
        const credential = await createUserWithEmailAndPassword(
          firebaseAuth(),
          email,
          password
        );
        await sendEmailVerification(credential.user);
        // Straight to the verification screen rather than via /app.
        //
        // Routing to /app worked only by accident: the dashboard would fetch,
        // get 403 pending_activation, and api-gate would bounce here. That put
        // a redirect race on the critical path of every signup, and it made the
        // screen a consequence of a failed request rather than a destination.
        // A user who has just been told to check their email should be looking
        // at the page that says so.
        router.push("/pending");
        return;
      }
      await signInWithEmailAndPassword(firebaseAuth(), email, password);
      router.push("/app");
    });
  };

  return (
    <main className="min-h-dvh grid lg:grid-cols-[1.1fr_1fr]">
      {/* Editorial ground — 深紺 is the colour of expectation (§6, §7). */}
      <section
        className="hidden lg:flex flex-col justify-between p-10"
        style={{ background: "var(--up-fill)" }}
      >
        <Link href="/" className="text-[11px] tracking-widest uppercase text-muted-foreground">
          UrbanOracle
        </Link>
        <div className="max-w-md">
          <h1 className="heading text-3xl leading-snug" style={{ color: "var(--up-text)" }}>
            都市の資産価値を、<br />上振れと下振れの両面から。
          </h1>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            東京23区の地価・人口・交通と、災害リスクを同一の意思決定面で読み解くための計器です。
          </p>
        </div>
        <p className="text-[10px] text-muted-foreground">
          出典: 不動産情報ライブラリ ／ e-Stat 国勢調査 ／ 国土数値情報
        </p>
      </section>

      <section className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="w-full max-w-sm mx-auto">
          <p className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">ACCESS</p>
          <h2 className="heading mt-2 text-2xl">
            {mode === "signin" ? "サインイン" : "アカウント作成"}
          </h2>

          <button
            type="button"
            onClick={signInGoogle}
            disabled={busy}
            className="mt-6 w-full rounded-sm border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
          >
            Google で{mode === "signin" ? "サインイン" : "登録"}
          </button>

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1" style={{ background: "var(--rule)" }} />
            <span className="text-[10px] text-muted-foreground">または</span>
            <span className="h-px flex-1" style={{ background: "var(--rule)" }} />
          </div>

          <form onSubmit={submitEmail} className="space-y-3">
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

            <label className="block">
              <span className="text-[11px] text-muted-foreground">パスワード</span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                className="mt-1 w-full rounded-sm border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
              />
            </label>

            {mode === "signup" && (
              <ul className="space-y-1" aria-label="パスワード要件">
                {checks.map((check) => (
                  <li
                    key={check.id}
                    data-check={check.id}
                    data-passed={check.passed}
                    className="flex items-center gap-2 text-[11px]"
                    style={{ color: check.passed ? "var(--up-text)" : "var(--muted-foreground)" }}
                  >
                    <span
                      aria-hidden
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{
                        background: check.passed ? "var(--up-text)" : "var(--rule-strong)",
                      }}
                    />
                    {check.label}
                  </li>
                ))}
              </ul>
            )}

            {error && (
              <p role="alert" className="text-[11px] leading-relaxed" style={{ color: "var(--down-text)" }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-sm px-4 py-2.5 text-sm font-medium transition-opacity disabled:opacity-50"
              style={{ background: "var(--up-text)", color: "var(--background)" }}
            >
              {mode === "signin" ? "サインイン" : "アカウントを作成"}
            </button>
          </form>

          <div className="mt-5 flex items-center justify-between text-[11px]">
            <button
              type="button"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError(null);
              }}
              className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              {mode === "signin" ? "アカウントをお持ちでない方" : "既にアカウントをお持ちの方"}
            </button>
            <Link
              href="/forgot-password"
              className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              パスワードをお忘れの方
            </Link>
          </div>

          <p className="mt-8 text-[10px] leading-relaxed text-muted-foreground">
            一つのアカウントで DXA Labs の全プロダクトにアクセスできます。
          </p>
          <p className="mt-2 font-mono text-[9px] text-muted-foreground">BUILD {BUILD_SHA}</p>
        </div>
      </section>
    </main>
  );
}
