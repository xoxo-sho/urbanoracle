"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { applyActionCode, type User } from "firebase/auth";
import LangToggle from "@/components/landing/LangToggle";
import { Emblem } from "@/app/pending/page";
import { firebaseAuth } from "@/lib/firebase";
import { requestVerificationEmail } from "@/lib/verify-flow";
import { ACTION_META, AUTH_COPY } from "@/i18n/auth";
import { LanguageProvider, useLang } from "@/i18n/lang-context";
import type { Lang } from "@/i18n/lang";
import "@/components/auth/verify-flow.css";

/**
 * /auth/action (Stage 2, 2026-10-25) — the link in UrbanOracle's verification
 * mail:
 *   /auth/action?mode=verifyEmail&oobCode=<code>&lang=<ja|en>
 * Applies the code on load (no button) exactly once, and moves on:
 * - this browser is signed in → reload, the finish step (a forced token
 *   refresh, then POST /api/v1/auth/re-evaluate), SAME, then /app after 2 s
 *   ("Open now" at once);
 * - it is not → OTHER: the screen the user started on (/pending) detects it by
 *   itself;
 * - the code is used or expired → SAME if the session is verified anyway,
 *   otherwise a way to a new link (EXPIRED_SIGNED_IN) or to sign in (EXPIRED);
 * - not a verifyEmail link → INVALID; the network failing → ERROR, whose button
 *   re-applies the same code.
 * Outside every auth gate on purpose: nothing here uses the gated fetch, so no
 * 401/403 redirect can reach it, and it never signs out. The link's `lang`
 * decides the language for this load and is never stored (LanguageProvider's
 * overrideLang); a press on the JA/EN toggle hands the page back to the stored
 * choice. Static export: the query is read once in a state initializer and
 * taken out of the address bar before paint. Structure and behaviour follow
 * Parti's app/auth/action/page.tsx.
 */

const ACTION_PATH = "/auth/action";
/** SAME: the progress bar's run before the dashboard opens by itself. */
const SAME_DELAY_MS = 2000;
const SUPPORT = "contact@dxalabs.com";

type ActionState =
  | "verifying"
  | "same" // confirmed in the browser that is signed in: the dashboard next
  | "other" // confirmed with no session here: the original screen moves on by itself
  | "expired" // a used or expired code, no session
  | "expiredSignedIn" // a used or expired code, signed in and still unverified
  | "invalid" // not a verifyEmail link, or no code
  | "error"; // the apply call failed for any other reason (the network)

interface LinkParams {
  mode: string | null;
  oobCode: string | null;
  lang: Lang | null;
}

function readLinkParams(): LinkParams {
  if (typeof window === "undefined") return { mode: null, oobCode: null, lang: null };
  const search = new URLSearchParams(window.location.search);
  const lang = search.get("lang");
  return { mode: search.get("mode"), oobCode: search.get("oobCode"), lang: lang === "ja" || lang === "en" ? lang : null };
}

const firebaseCode = (err: unknown): string =>
  typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : "";

function PhoneIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect x="10" y="4" width="12" height="24" rx="2.5" />
      <path d="M15 24.5h2" />
    </svg>
  );
}

function LaptopIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect x="6" y="7" width="20" height="13" rx="1.5" />
      <path d="M3 24h26" />
    </svg>
  );
}

export default function AuthActionPage() {
  // Read once, on the first render. The server knows no URL, so the first
  // client render agrees with the prerendered HTML (every decision below is
  // made in effects or in a state initializer, never in markup).
  const [params] = useState(readLinkParams);
  return (
    <LanguageProvider meta={ACTION_META} overrideLang={params.lang}>
      <AuthActionScreen params={params} />
    </LanguageProvider>
  );
}

function AuthActionScreen({ params }: { params: LinkParams }) {
  const router = useRouter();
  const { lang } = useLang();
  const t = AUTH_COPY[lang];

  // The code is single-use and grants verification: it must not linger in
  // history, bookmarks or a later Referer. Out before the first paint.
  useLayoutEffect(() => {
    if (window.location.search) window.history.replaceState(null, "", ACTION_PATH);
  }, []);

  // The link's shape decides INVALID before anything runs.
  const [state, setState] = useState<ActionState>(() =>
    params.mode !== "verifyEmail" || !params.oobCode ? "invalid" : "verifying"
  );
  const [notice, setNotice] = useState<"sendFailed" | null>(null);
  const [busy, setBusy] = useState(false);

  const mounted = useRef(false);
  const started = useRef(false); // StrictMode runs effects twice; apply once
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

  const openDashboard = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current.clear();
    router.replace("/app");
  };

  // SAME: the finish step first (the dashboard's first request must not be
  // answered 403), then 2 s of progress, then /app.
  const goSame = async (user: User) => {
    try {
      const token = await user.getIdToken(true);
      const res = await fetch("/api/v1/auth/re-evaluate", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`re-evaluate HTTP ${res.status}`);
    } catch (err) {
      // The code is applied either way; the dashboard converges the account on
      // its next verified request.
      console.error("[urbanoracle] auth/action: could not confirm the session after verifying:", err);
    }
    if (!mounted.current) return;
    setState("same");
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      if (mounted.current) router.replace("/app");
    }, SAME_DELAY_MS);
    timers.current.add(id);
  };

  const apply = async (code: string) => {
    setState("verifying");
    setNotice(null);
    const auth = firebaseAuth();
    try {
      await applyActionCode(auth, code);
    } catch (err) {
      const errCode = firebaseCode(err);
      if (errCode !== "auth/invalid-action-code" && errCode !== "auth/expired-action-code") {
        console.error("[urbanoracle] auth/action: the code could not be applied:", err);
        if (mounted.current) setState("error");
        return;
      }
      // Used or expired. A signed-in user may be verified anyway (an earlier
      // click on this link, or on another one).
      const user = auth.currentUser;
      if (!user) {
        if (mounted.current) setState("expired");
        return;
      }
      try {
        await user.reload();
      } catch (reloadErr) {
        console.error("[urbanoracle] auth/action: could not reload the user:", reloadErr);
        if (mounted.current) setState("error");
        return;
      }
      if (user.emailVerified) await goSame(user);
      else if (mounted.current) setState("expiredSignedIn");
      return;
    }
    const user = auth.currentUser;
    if (!user) {
      if (mounted.current) setState("other");
      return;
    }
    try {
      await user.reload();
    } catch (err) {
      // The code is applied; the forced refresh in goSame still sees it.
      console.error("[urbanoracle] auth/action: could not reload the user after verifying:", err);
    }
    await goSame(user);
  };

  // The link, once: wait for the session to be known, then apply.
  const applyRef = useRef(apply);
  useEffect(() => {
    applyRef.current = apply;
  });
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const { mode, oobCode } = params;
    if (mode !== "verifyEmail" || !oobCode) return;
    void (async () => {
      await firebaseAuth().authStateReady();
      await applyRef.current(oobCode);
    })();
  }, [params]);

  // EXPIRED_SIGNED_IN: a new mail in this page's language, then the waiting screen.
  const sendNewLink = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await requestVerificationEmail(lang);
      if (result.kind === "already_verified") {
        const user = firebaseAuth().currentUser;
        if (user) await goSame(user);
        return;
      }
      router.replace("/pending");
    } catch (err) {
      console.error("[urbanoracle] auth/action: a new link could not be sent:", err);
      if (mounted.current) setNotice("sendFailed");
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const retry = () => {
    if (params.oobCode) void apply(params.oobCode);
  };

  const noticeLine = notice ? (
    <p className="vf-notice vf-notice--sendFailed" role="alert">
      {t.verifySendFailed}
    </p>
  ) : null;

  let body: ReactNode;
  switch (state) {
    case "verifying":
      body = (
        <>
          <Emblem variant="spin" />
          <h1 className="heading vf-title">{t.actionVerifying}</h1>
        </>
      );
      break;
    case "same":
      body = (
        <>
          <Emblem variant="done" />
          <h1 className="heading vf-title">{t.actionSameHeading}</h1>
          <p className="vf-lead">{t.actionSameLead}</p>
          <div className="vf-progress" role="progressbar" aria-label={t.actionSameLead}>
            <div className="vf-progress-bar" />
          </div>
          <button type="button" className="vf-primary" onClick={openDashboard}>
            {t.actionOpenNow}
          </button>
        </>
      );
      break;
    case "other":
      body = (
        <>
          <Emblem variant="done" />
          <h1 className="heading vf-title">{t.actionOtherHeading}</h1>
          <p className="vf-lead">{t.actionOtherLead}</p>
          <div className="vf-diagram" role="img" aria-label={t.actionDiagramLabel}>
            <span className="vf-device">
              <PhoneIcon />
              {t.actionCaptionThisDevice}
            </span>
            <svg className="vf-diagram-line" aria-hidden="true" focusable="false" preserveAspectRatio="none" viewBox="0 0 100 2">
              <line x1="0" y1="1" x2="100" y2="1" />
            </svg>
            <span className="vf-device">
              <LaptopIcon />
              {t.actionCaptionOriginal}
            </span>
          </div>
          <Link className="vf-secondary" href="/login">
            {t.actionContinueHere}
          </Link>
          <p className="vf-note">{t.actionContinueHint}</p>
        </>
      );
      break;
    case "expired":
      body = (
        <>
          <Emblem variant="warning" />
          <h1 className="heading vf-title">{t.actionExpiredHeading}</h1>
          <p className="vf-lead">{t.actionExpiredLead}</p>
          <Link className="vf-primary" href="/login">
            {t.actionExpiredButton}
          </Link>
          <p className="vf-note">{t.actionExpiredNote}</p>
        </>
      );
      break;
    case "expiredSignedIn":
      body = (
        <>
          <Emblem variant="warning" />
          <h1 className="heading vf-title">{t.actionExpiredHeading}</h1>
          {noticeLine}
          <button type="button" className="vf-primary" disabled={busy} onClick={() => void sendNewLink()}>
            {t.actionExpiredSendNew}
          </button>
        </>
      );
      break;
    case "invalid":
      body = (
        <>
          <Emblem variant="warning" />
          <h1 className="heading vf-title">{t.actionInvalidHeading}</h1>
          <p className="vf-lead">{t.actionInvalidLead}</p>
          <Link className="vf-primary" href="/login">
            {t.actionInvalidButton}
          </Link>
        </>
      );
      break;
    case "error":
      body = (
        <>
          <Emblem variant="warning" />
          <h1 className="heading vf-title">{t.actionErrorHeading}</h1>
          <p className="vf-lead">{t.actionErrorLead}</p>
          <button type="button" className="vf-primary" onClick={retry}>
            {t.actionErrorButton}
          </button>
        </>
      );
      break;
  }

  const [helpBefore, helpAfter] = t.actionHelp.split("{address}");
  const showHelp = state !== "verifying" && state !== "same";
  return (
    <main data-verify-flow="action" data-auth-action="">
      <header className="vf-action-header">
        <span className="heading vf-wordmark" translate="no">
          {t.brand}
        </span>
        <LangToggle />
      </header>
      <div className="vf-action-card" aria-live="polite">
        {body}
        {showHelp && (
          <p className="vf-help">
            {helpBefore}
            <a href={`mailto:${SUPPORT}`}>{SUPPORT}</a>
            {helpAfter}
          </p>
        )}
      </div>
    </main>
  );
}
