"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import AuthShell from "@/components/auth/AuthShell";
import { useAuth } from "@/lib/auth-context";
import { firebaseAuth } from "@/lib/firebase";
import { consumeAutoSendFlag, currentLang, mailProviderFor, requestVerificationEmail, type MailProviderId } from "@/lib/verify-flow";
import { AUTH_COPY, AUTH_META, type AuthKey } from "@/i18n/auth";
import { LanguageProvider, useLang } from "@/i18n/lang-context";
import "@/components/auth/verify-flow.css";

/**
 * /pending (Stage 2, 2026-10-25) — the screen a signed-in user whose address
 * is not yet verified waits on, in the reader's language (src/i18n/auth.ts),
 * inside the family's split shell (AuthShell) with the shell's data-auth-*
 * structure: wordmark, subtitle, the verify title, the resend button, the
 * details block as the divider. Structure and behaviour follow Parti's
 * app/verify/page.tsx.
 *
 * WAITING: the pill, the emblem, the address, a webmail shortcut for a known
 * domain, the two steps, a resend button held by the server's countdown, the
 * delivery hints, Log out. The mail is UrbanOracle's own — POST
 * /api/v1/auth/verification-email (lib/verify-flow.ts); arriving with the
 * one-shot flag (/login) asks for it exactly once. Detection is automatic
 * (D2: no manual button): reload() + emailVerified every 4 s while the tab is
 * visible, at once on becoming visible and on window focus — no polling in a
 * hidden tab.
 *
 * DETECTED: shown for at least 1.2 s while the finish step runs — a forced
 * token refresh, then POST /api/v1/auth/re-evaluate so the account's
 * is_active flips before the dashboard's first request (a cached token still
 * carries email_verified:false) — then /app. The fallback link is the way
 * there if the step fails; /app's own gated requests converge the account
 * on the next verified token anyway (core/provisioning.py).
 *
 * The screen renders without a session too (the built export is loaded that
 * way by the e2e suites and by a visitor who typed the URL): no redirect, the
 * placeholder address, a disabled resend, and a way to sign in.
 *
 * The document title stays the site's (AUTH_META), not Parti's verify.title:
 * e2e/lang-title.spec.ts budgets five <title> writes per load and /pending
 * already uses all five at origin/main; a title of its own costs one more per
 * language phase and tipped the budget (6) in one load of ten.
 */

/** How often an open, visible /pending asks Firebase whether the address is verified. */
const POLL_MS = 4000;
/** The confirmed state stays on screen at least this long while the finish step runs. */
const DETECTED_MIN_MS = 1200;

type Phase = "waiting" | "detected";
type Notice = "resent" | "dailyLimit" | "sendFailed";

const NOTICE_KEYS: Record<Notice, AuthKey> = {
  resent: "verifyResent",
  dailyLimit: "verifyDailyLimit",
  sendFailed: "verifySendFailed",
};
const PROVIDER_KEYS: Record<MailProviderId, AuthKey> = {
  gmail: "verifyProviderGmail",
  outlook: "verifyProviderOutlook",
  yahoo: "verifyProviderYahoo",
  icloud: "verifyProviderIcloud",
};

/** The sender's address and domain, set in monospace inside the hints — the address first, so its domain is not split out of it. */
const SENDER = ["noreply@send.dxalabs.com", "send.dxalabs.com"];

function withSender(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  while (rest) {
    let at = -1;
    let hit = "";
    for (const s of SENDER) {
      const i = rest.indexOf(s);
      if (i >= 0 && (at < 0 || i < at)) {
        at = i;
        hit = s;
      }
    }
    if (at < 0) {
      out.push(rest);
      break;
    }
    if (at > 0) out.push(rest.slice(0, at));
    out.push(<code key={out.length}>{hit}</code>);
    rest = rest.slice(at + hit.length);
  }
  return out;
}

const describe = (err: unknown): string => (err instanceof Error ? `${err.name}: ${err.message}` : String(err));

/**
 * The 104 px emblem: a hairline circle with four registration ticks. WAITING:
 * a 2 px arc turning around a mail icon. DETECTED: an ok-coloured circle draws
 * closed, then a check. Problem states: a dashed ring with a link-off icon
 * (verify-flow.css .vf-emblem). Shared with /auth/action.
 */
export function Emblem({ variant }: { variant: "spin" | "done" | "warning" }) {
  return (
    <div className={`vf-emblem vf-emblem--${variant}`} aria-hidden="true">
      <svg className="vf-ring" viewBox="0 0 104 104" focusable="false">
        <circle className="vf-ring-base" cx="52" cy="52" r="44" />
        <path className="vf-ring-ticks" d="M52 2v11M52 91v11M2 52h11M91 52h11" />
        {variant === "spin" && <circle className="vf-ring-arc" cx="52" cy="52" r="44" />}
        {variant === "done" && <circle className="vf-ring-done" cx="52" cy="52" r="44" pathLength={1} />}
        {variant === "done" && <path className="vf-ring-check" d="M37 53l10 10 20-22" pathLength={1} />}
      </svg>
      {variant === "spin" && (
        <svg className="vf-emblem-icon" viewBox="0 0 32 32" focusable="false">
          <rect x="4" y="7" width="24" height="18" rx="2" />
          <path d="M5 9l11 8 11-8" />
        </svg>
      )}
      {variant === "warning" && (
        <svg className="vf-emblem-icon" viewBox="0 0 32 32" focusable="false">
          <path d="M13.5 18.5l-3 3a4 4 0 0 1-5.7-5.7l3-3M18.5 13.5l3-3a4 4 0 0 1 5.7 5.7l-3 3M5 5l22 22" />
        </svg>
      )}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M9 3h4v4M13 3L7.5 8.5M11.5 9.5V13H3V4.5h3.5" />
    </svg>
  );
}

export default function VerifyEmailPage() {
  return (
    <LanguageProvider meta={AUTH_META}>
      <VerifyEmailScreen />
    </LanguageProvider>
  );
}

function VerifyEmailScreen() {
  const { lang } = useLang();
  const t = AUTH_COPY[lang];
  const { user } = useAuth();
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("waiting");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);

  const email = user?.email ?? null;
  const hasUser = user !== null;

  const mounted = useRef(false);
  const finishing = useRef(false); // the verified flow has started
  const checking = useRef(false); // one reload at a time
  const sendingNow = useRef(false); // one mail request at a time
  const timers = useRef(new Set<number>());

  useEffect(() => {
    mounted.current = true;
    const pending = timers.current;
    return () => {
      mounted.current = false;
      pending.forEach((id) => window.clearTimeout(id));
      pending.clear();
    };
  }, []);

  // The finish step: a token that carries email_verified first, then the
  // backend re-runs the activation rule, so the dashboard's first request is
  // answered 200 rather than 403 → /pending again.
  const reevaluate = async (current: NonNullable<ReturnType<typeof firebaseAuth>["currentUser"]>) => {
    const token = await current.getIdToken(true);
    const res = await fetch("/api/v1/auth/re-evaluate", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`re-evaluate HTTP ${res.status}`);
  };

  // Verified: DETECTED for at least DETECTED_MIN_MS while the finish step runs.
  const finish = async () => {
    const current = firebaseAuth().currentUser;
    if (!current || finishing.current) return;
    finishing.current = true;
    setPhase("detected");
    setNote(null);
    const shown = new Promise<void>((resolve) => {
      const id = window.setTimeout(() => {
        timers.current.delete(id);
        resolve();
      }, DETECTED_MIN_MS);
      timers.current.add(id);
    });
    try {
      await Promise.all([reevaluate(current), shown]);
    } catch (err) {
      // Named on screen and logged; the fallback link below still opens the
      // dashboard, which converges the account on its next verified request.
      console.error("[urbanoracle] verify: could not confirm verification:", err);
      if (mounted.current) setNote(`${t.verifyFinishFailed}: ${describe(err)}`);
      return;
    }
    if (mounted.current) router.replace("/app");
  };

  // One automatic check. A failure is logged and retried on the next tick:
  // nothing was clicked, so nothing on screen claims a failure.
  const check = async () => {
    const current = firebaseAuth().currentUser;
    if (!current || finishing.current || checking.current) return;
    checking.current = true;
    try {
      await current.reload();
      if (current.emailVerified) void finish();
    } catch (err) {
      console.warn("[urbanoracle] verify: automatic check failed, retrying:", err);
    } finally {
      checking.current = false;
    }
  };

  // Ask the backend for the mail. The server's retry_after drives the
  // countdown; "cooldown" shows as sent; "already_verified" is the verified flow.
  const send = async (source: "auto" | "manual") => {
    if (sendingNow.current) return;
    sendingNow.current = true;
    setSending(true);
    if (source === "manual") setNotice(null);
    try {
      const result = await requestVerificationEmail(currentLang());
      if (!mounted.current) return;
      if (result.kind === "already_verified") {
        void finish();
        return;
      }
      setCountdown(Math.max(0, Math.ceil(result.retryAfter)));
      if (result.kind === "daily_limit") setNotice("dailyLimit");
      else if (source === "manual") setNotice("resent");
    } catch (err) {
      console.error("[urbanoracle] verify: the confirmation email could not be sent:", err);
      if (mounted.current) setNotice("sendFailed");
    } finally {
      sendingNow.current = false;
      if (mounted.current) setSending(false);
    }
  };

  // Effects call the latest check/send without restarting on every render.
  const checkRef = useRef(check);
  const sendRef = useRef(send);
  useEffect(() => {
    checkRef.current = check;
    sendRef.current = send;
  });

  // The one-shot auto-send. The flag is removed synchronously, before the
  // request goes out, so StrictMode's second effect run, a reload or a later
  // visit sends nothing.
  useEffect(() => {
    if (!hasUser || !consumeAutoSendFlag()) return;
    queueMicrotask(() => void sendRef.current("auto"));
  }, [hasUser]);

  // Detection: poll only while visible; check at once on becoming visible and
  // on focus; stop once verified (or unmounted).
  const watching = phase === "waiting" && hasUser;
  useEffect(() => {
    if (!watching) return;
    let interval: number | undefined;
    const stop = () => {
      if (interval !== undefined) window.clearInterval(interval);
      interval = undefined;
    };
    const start = () => {
      stop();
      interval = window.setInterval(() => void checkRef.current(), POLL_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void checkRef.current();
        start();
      } else {
        stop();
      }
    };
    const onFocus = () => void checkRef.current();
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [watching]);

  // The resend countdown, from the server's retry_after.
  const counting = countdown > 0;
  useEffect(() => {
    if (!counting) return;
    const id = window.setInterval(() => setCountdown((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [counting]);

  // The way out, both for the wrong account and for a wrong address: drop the
  // session, then the sign-in route (whose in-place toggle is this product's
  // sign-up entry) with replace, so Back does not land on a verification
  // screen for a session that has ended. If Firebase refuses, the user is
  // still signed in, stays here, and is told so.
  const leave = async () => {
    try {
      await signOut(firebaseAuth());
    } catch (err) {
      console.error("[urbanoracle] sign-out failed:", err);
      if (mounted.current) setNote(`${t.verifySignOutFailed}: ${describe(err)}`);
      return;
    }
    router.replace("/login");
  };
  const onChangeAddress = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    void leave();
  };

  const noteLine = note ? (
    <p className="vf-notice vf-notice--sendFailed" role="alert">
      {note}
    </p>
  ) : null;

  let body: ReactNode;
  if (phase === "detected") {
    const [leadBefore, leadAfter] = t.verifyDetectedLead.split("{email}");
    body = (
      <>
        <p className="vf-pill vf-pill--ok">
          <CheckIcon />
          {t.verifyDetectedPill}
        </p>
        <Emblem variant="done" />
        <h2 data-auth-verify-title="" className="heading vf-title">
          {t.verifyDetectedHeading}
        </h2>
        <p className="vf-lead">
          {leadBefore}
          {email ?? t.verifyYourAddress}
          {leadAfter}
        </p>
        <div className="vf-progress" role="progressbar" aria-label={t.verifyPreparing}>
          <div className="vf-progress-bar" />
        </div>
        <p className="vf-progress-label">{t.verifyPreparing}</p>
        {noteLine}
        <p className="vf-note">
          {t.verifyFallback}{" "}
          <Link className="vf-text-link" href="/app">
            {t.verifyFallbackLink}
          </Link>
        </p>
      </>
    );
  } else {
    const provider = mailProviderFor(email);
    const [countBefore, countAfter] = t.verifyCountdown.split("{seconds}");
    body = (
      <>
        <p className="vf-pill">
          <span className="vf-pill-dot" aria-hidden="true" />
          {t.verifyPill}
        </p>
        <Emblem variant="spin" />
        <h2 data-auth-verify-title="" className="heading vf-title">
          {t.verifyHeading}
        </h2>
        <p className="vf-lead">{t.verifyLead}</p>
        <strong className="vf-address">{email ?? t.verifyYourAddress}</strong>
        {hasUser ? (
          <Link className="vf-text-link" href="/login" onClick={onChangeAddress}>
            {t.verifyChangeAddress}
          </Link>
        ) : (
          <Link className="vf-text-link" href="/login">
            {t.backToSignIn}
          </Link>
        )}
        {provider && (
          <a className="vf-primary" href={provider.url} target="_blank" rel="noopener noreferrer">
            {t[PROVIDER_KEYS[provider.id]]}
            <ExternalIcon />
          </a>
        )}
        <ol className="vf-steps">
          <li>
            <span className="vf-step-num" aria-hidden="true">
              1
            </span>
            <span>{t.verifyStep1}</span>
          </li>
          <li>
            <span className="vf-step-num" aria-hidden="true">
              2
            </span>
            <span>{t.verifyStep2}</span>
          </li>
        </ol>
        <div className="vf-resend">
          <button
            type="button"
            data-auth-verify-resend=""
            className="vf-outline"
            onClick={() => void send("manual")}
            disabled={!hasUser || sending || countdown > 0}
          >
            {t.verifyResend}
          </button>
          {countdown > 0 && (
            <p className="vf-countdown">
              {countBefore}
              <span className="vf-mono">{countdown}</span>
              {countAfter}
            </p>
          )}
        </div>
        {notice && (
          <p className={`vf-notice vf-notice--${notice}`} role={notice === "sendFailed" ? "alert" : "status"}>
            {t[NOTICE_KEYS[notice]]}
          </p>
        )}
        {noteLine}
        <details data-auth-divider="" className="vf-details" open>
          <summary>{t.verifyDetails}</summary>
          <ul>
            <li>{withSender(t.verifyHintSpam)}</li>
            <li>{withSender(t.verifyHintCarrier)}</li>
            <li>{withSender(t.verifyHintCompany)}</li>
          </ul>
        </details>
        {hasUser && (
          <button type="button" className="vf-logout" onClick={() => void leave()}>
            {t.verifyLogout}
          </button>
        )}
      </>
    );
  }

  return (
    <AuthShell>
      <div data-verify-flow="pending">
        <div>
          <h1 data-auth-wordmark="" className="heading text-[28px] leading-tight">
            {t.brand}
          </h1>
          <p data-auth-subtitle="" className="mt-1.5 text-[13px] text-muted-foreground">
            {t.subtitle}
          </p>
        </div>
        {body}
        <p className="vf-about">
          <Link href="/">{t.aboutLink}</Link>
        </p>
      </div>
    </AuthShell>
  );
}
