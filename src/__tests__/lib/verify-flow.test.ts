import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEY } from "@/i18n/lang";

/**
 * src/lib/verify-flow.ts (Stage 2): what /login, /pending and /auth/action
 * share — the one-shot auto-send flag, the reader's language for the mail,
 * the webmail shortcut per address domain, and the request for UrbanOracle's
 * own verification mail with its four answers.
 *
 *   R-F1  no production file calls Firebase's sendEmailVerification any more
 *   R-F6  every listed domain maps to its webmail (the domain lowercased);
 *         example.com and any other domain → none
 *   F2    requestVerificationEmail: sent / cooldown / daily_limit /
 *         already_verified resolve; a 5xx or a network failure rejects with
 *         VerificationRequestError; the request carries the current ID token
 *         and never goes through api-gate (a 403 would become a redirect)
 *
 * The module is imported inside each test (load), so that before it exists
 * each test fails on its own line.
 */

const h = vi.hoisted(() => ({
  user: null as { getIdToken: (force?: boolean) => Promise<string> } | null,
  calls: [] as { url: string; init: RequestInit | undefined }[],
  answer: { status: 200, body: {} as unknown } as { status: number; body: unknown } | "network",
}));

vi.mock("@/lib/firebase", () => ({ firebaseAuth: () => ({ currentUser: h.user }) }));

type Flow = {
  AUTO_SEND_FLAG: string;
  ENDPOINT: string;
  setAutoSendFlag(): void;
  clearAutoSendFlag(): void;
  consumeAutoSendFlag(): boolean;
  currentLang(): "ja" | "en";
  mailProviderFor(email: string | null | undefined): { id: string; url: string } | null;
  requestVerificationEmail(lang: "ja" | "en"): Promise<unknown>;
  VerificationRequestError: new (...args: never[]) => Error & { status: number | null };
};
const MODULE = "../../lib/verify-flow";
const load = async (): Promise<Flow> => (await import(/* @vite-ignore */ MODULE)) as Flow;

const FLAG = "urbanoracle.verify.autoSend";
const ENDPOINT = "/api/v1/auth/verification-email";
const GMAIL = "https://mail.google.com/mail/u/0/#search/from%3Anoreply%40send.dxalabs.com+in%3Aanywhere";
const OUTLOOK = "https://outlook.live.com/mail/0/";
const YAHOO = "https://mail.yahoo.co.jp/";
const ICLOUD = "https://www.icloud.com/mail";

beforeEach(() => {
  h.user = { getIdToken: vi.fn(() => Promise.resolve("id-token-0001")) };
  h.calls = [];
  h.answer = { status: 200, body: { sent: true, retry_after: 60 } };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      h.calls.push({ url, init });
      const a = h.answer;
      if (a === "network") throw new TypeError("Failed to fetch");
      return {
        ok: a.status >= 200 && a.status < 300,
        status: a.status,
        statusText: "",
        text: async () => JSON.stringify(a.body),
        json: async () => a.body,
      } as unknown as Response;
    })
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

/** Every production source file under src (tests excluded). */
function productionFiles(dir = path.join(process.cwd(), "src")): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return entry === "__tests__" ? [] : productionFiles(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });
}

describe("the client never sends the verification mail itself (R-F1)", () => {
  it("no production file under src/ names sendEmailVerification", () => {
    const files = productionFiles();
    expect(files.length).toBeGreaterThan(40);
    const offenders = files
      .filter((f) => readFileSync(f, "utf8").includes("sendEmailVerification"))
      .map((f) => path.relative(process.cwd(), f));
    expect(offenders).toEqual([]);
  });
});

describe("the one-shot auto-send flag", () => {
  it("is urbanoracle.verify.autoSend in sessionStorage; reading it removes it", async () => {
    const f = await load();
    expect(f.AUTO_SEND_FLAG).toBe(FLAG);
    expect(f.consumeAutoSendFlag(), "nothing set").toBe(false);
    f.setAutoSendFlag();
    expect(window.sessionStorage.getItem(FLAG)).toBe("1");
    expect(f.consumeAutoSendFlag()).toBe(true);
    expect(f.consumeAutoSendFlag(), "once per flag").toBe(false);
    f.setAutoSendFlag();
    f.clearAutoSendFlag();
    expect(window.sessionStorage.getItem(FLAG)).toBeNull();
  });

  it("the mail's language is the reader's: ?lang=, then urbanoracle.lang, then Japanese", async () => {
    const f = await load();
    expect(f.currentLang()).toBe("ja");
    window.localStorage.setItem(STORAGE_KEY, "en");
    expect(f.currentLang()).toBe("en");
    window.history.replaceState(null, "", "/pending?lang=ja");
    expect(f.currentLang()).toBe("ja");
  });
});

describe("the webmail shortcut (R-F6)", () => {
  it.each([
    ["gmail.com", GMAIL],
    ["googlemail.com", GMAIL],
    ["outlook.com", OUTLOOK],
    ["outlook.jp", OUTLOOK],
    ["hotmail.com", OUTLOOK],
    ["hotmail.co.jp", OUTLOOK],
    ["live.com", OUTLOOK],
    ["live.jp", OUTLOOK],
    ["msn.com", OUTLOOK],
    ["yahoo.co.jp", YAHOO],
    ["ymail.ne.jp", YAHOO],
    ["icloud.com", ICLOUD],
    ["me.com", ICLOUD],
    ["mac.com", ICLOUD],
  ])("%s → its webmail", async (domain, url) => {
    const f = await load();
    expect(f.mailProviderFor(`someone@${domain}`)?.url).toBe(url);
    expect(f.mailProviderFor(`Someone@${domain.toUpperCase()}`)?.url, "the domain is lowercased").toBe(url);
  });

  it.each(["example.com", "docomo.ne.jp", "gmail.com.evil.example", "yahoo.com"])("%s → no shortcut", async (domain) => {
    const f = await load();
    expect(f.mailProviderFor(`someone@${domain}`)).toBeNull();
  });

  it("no address → no shortcut", async () => {
    const f = await load();
    expect(f.mailProviderFor(null)).toBeNull();
    expect(f.mailProviderFor(undefined)).toBeNull();
    expect(f.mailProviderFor("")).toBeNull();
  });
});

describe("requestVerificationEmail (F2)", () => {
  it("POSTs {lang} to /api/v1/auth/verification-email with the current ID token, as JSON", async () => {
    const f = await load();
    expect(f.ENDPOINT).toBe(ENDPOINT);
    await f.requestVerificationEmail("ja");
    expect(h.calls.length).toBe(1);
    const { url, init } = h.calls[0];
    expect(url).toBe(ENDPOINT);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ lang: "ja" });
    const headers = init?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer id-token-0001");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it.each([
    [200, { sent: true, retry_after: 60 }, { kind: "sent", retryAfter: 60 }],
    [429, { detail: "cooldown", retry_after: 42 }, { kind: "cooldown", retryAfter: 42 }],
    [429, { detail: "daily_limit", retry_after: 3600 }, { kind: "daily_limit", retryAfter: 3600 }],
    [409, { detail: "already_verified" }, { kind: "already_verified" }],
  ])("%s %j resolves to %j", async (status, body, outcome) => {
    const f = await load();
    h.answer = { status, body };
    await expect(f.requestVerificationEmail("en")).resolves.toEqual(outcome);
  });

  it.each([
    [503, { detail: "verification_unavailable" }],
    [502, { detail: "email_send_failed" }],
    [500, { detail: "database unavailable" }],
    [401, { detail: "Invalid or expired token" }],
    [403, { status: "pending_activation" }],
  ])("a %s rejects with VerificationRequestError carrying the status — never a redirect", async (status, body) => {
    const f = await load();
    h.answer = { status, body };
    const err = await f.requestVerificationEmail("en").then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(f.VerificationRequestError);
    expect((err as { status: number | null }).status).toBe(status);
  });

  it("a network failure rejects with VerificationRequestError (status null)", async () => {
    const f = await load();
    h.answer = "network";
    const err = await f.requestVerificationEmail("en").then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(f.VerificationRequestError);
    expect((err as { status: number | null }).status).toBeNull();
  });

  it("nobody signed in: rejects without a request", async () => {
    const f = await load();
    h.user = null;
    await expect(f.requestVerificationEmail("en")).rejects.toBeInstanceOf(f.VerificationRequestError);
    expect(h.calls).toEqual([]);
  });
});
