import { StrictMode, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEY } from "@/i18n/lang";

/**
 * /pending (Stage 2, 2026-10-25): the waiting screen, detection without a
 * button, and UrbanOracle's own mail (lib/verify-flow.ts → POST
 * /api/v1/auth/verification-email — never Firebase's sendEmailVerification).
 *   R-F2  arriving with the one-shot flag posts the mail request exactly once,
 *         even under StrictMode; arriving without it posts nothing
 *   R-F3  reload() runs every 4 s only while the tab is visible, at once on
 *         becoming visible and on focus; nothing is left after unmount
 *   R-F4  verified → DETECTED for at least 1200 ms while the finish step runs
 *         (getIdToken(true), then POST /api/v1/auth/re-evaluate) → /app
 *   R-F5  resend: the server's countdown, the daily limit, a failure
 *   R-F6  the webmail shortcut for a known domain, in a new tab
 *   R-F7  the change-address link signs out, then /login (this product's
 *         sign-up entry is /login's in-place toggle)
 *   A1    the new flow says サインイン / サインアウト (Sign in / Sign out), the
 *         product's own terms (/login, /app) — never Parti's ログイン / ログアウト
 *   R-F13 no manual 「認証を確認」 button (D2: detection is automatic)
 *   UO    the screen still renders anonymously, without redirecting, with a
 *         way to sign in; the shell's data-auth-* structure stays
 *
 * firebase/auth and @/lib/firebase are mocked at the module boundary: the
 * provider and the page share one auth object whose currentUser the test
 * sets; onAuthStateChanged reports it synchronously. Replaced tests are named
 * by their old name in a comment.
 */

type MockUser = {
  email: string;
  emailVerified: boolean;
  reload: () => Promise<void>;
  getIdToken: (force?: boolean) => Promise<string>;
};
type Answer = { status: number; body: unknown } | "network";

const h = vi.hoisted(() => ({
  auth: { name: "the-app-auth-instance", currentUser: null as MockUser | null, authStateReady: async () => undefined },
  router: { replace: vi.fn(), push: vi.fn(), prefetch: vi.fn(), back: vi.fn() },
  signOut: (() => Promise.resolve()) as () => Promise<void>,
  posts: [] as { url: string; body: unknown; auth: string | null }[],
  answer: { status: 200, body: { sent: true, retry_after: 60 } } as Answer,
  reevaluate: { status: 200, body: { status: "active", email_verified: true, role: "viewer" } } as Answer,
}));

vi.mock("next/navigation", () => ({ useRouter: () => h.router }));
vi.mock("@/lib/firebase", () => ({
  firebaseAuth: () => h.auth,
  BUILD_SHA: "test",
  isDummyConfig: () => true,
}));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth: unknown, next: (user: unknown) => void) => {
    next(h.auth.currentUser);
    return () => {};
  },
  signOut: () => h.signOut(),
  applyActionCode: () => Promise.reject(new Error("not on this screen")),
  sendEmailVerification: () => Promise.reject(new Error("Stage 2: the client never sends the verification mail")),
}));

import VerifyEmailPage from "@/app/pending/page";
import { AuthProvider } from "@/lib/auth-context";

const FLAG = "urbanoracle.verify.autoSend";
const ENDPOINT = "/api/v1/auth/verification-email";
const REEVALUATE = "/api/v1/auth/re-evaluate";

let visibility: DocumentVisibilityState = "visible";
Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
const setVisibility = (v: DocumentVisibilityState) => {
  visibility = v;
  document.dispatchEvent(new Event("visibilitychange"));
};

function mockUser(over: Partial<MockUser> = {}): MockUser {
  return {
    email: "harness@example.com",
    emailVerified: false,
    reload: vi.fn(() => Promise.resolve()),
    getIdToken: vi.fn(() => Promise.resolve("t")),
    ...over,
  };
}

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      h.posts.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined, auth: headers["Authorization"] ?? null });
      const a = url === REEVALUATE ? h.reevaluate : h.answer;
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
}

const firebaseFailure = () =>
  Object.assign(new Error("Firebase: Error (auth/network-request-failed)."), { name: "FirebaseError" });

function mount(ui: ReactNode = <VerifyEmailPage />, { strict = false } = {}) {
  const tree = <AuthProvider>{ui}</AuthProvider>;
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

/** Let promises settle (real timers). */
const settle = async () => {
  for (let i = 0; i < 5; i++) await act(async () => {});
};
/** Advance fake time and let promises settle. */
const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
const mailPosts = () => h.posts.filter((p) => p.url === ENDPOINT);
const reevaluatePosts = () => h.posts.filter((p) => p.url === REEVALUATE);
const heading = () => screen.getByRole("heading", { level: 2 }).textContent;

let errors: unknown[][] = [];
let warnings: unknown[][] = [];
const loggedWith = (list: unknown[][], prefix: string) => list.filter((a) => typeof a[0] === "string" && a[0].startsWith(prefix));

beforeEach(() => {
  window.localStorage.setItem(STORAGE_KEY, "en");
  window.sessionStorage.clear();
  visibility = "visible";
  errors = [];
  warnings = [];
  h.auth.currentUser = mockUser();
  h.router.replace.mockClear();
  h.router.push.mockClear();
  h.signOut = vi.fn(() => Promise.resolve());
  h.posts = [];
  h.answer = { status: 200, body: { sent: true, retry_after: 60 } };
  h.reevaluate = { status: 200, body: { status: "active", email_verified: true, role: "viewer" } };
  stubFetch();
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args);
  });
  vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    warnings.push(args);
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("the waiting screen (R-F13, UO structure)", () => {
  it("in English: pill, heading, lead, the address in <strong>, sign up again, resend, the hints, Sign out — and no manual verify button", async () => {
    mount();
    await settle();
    expect(screen.getByText("Waiting for confirmation")).toBeDefined();
    expect(heading()).toBe("Check your email");
    expect(screen.getByText("We sent a confirmation link to:")).toBeDefined();
    expect(screen.getByText("harness@example.com").tagName).toBe("STRONG");
    expect(screen.getByRole("link", { name: "Wrong address? Sign up again" }).getAttribute("href")).toBe("/login");
    expect(screen.getByRole("button", { name: "Resend confirmation email" })).toBeDefined();
    expect(screen.getByText("Didn't get the email?").tagName).toBe("SUMMARY");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Check verification" }), "R-F13: no manual button").toBeNull();
    expect(screen.queryByRole("button", { name: "認証を確認" })).toBeNull();
    expect(document.querySelector("[data-auth-verify-check]")).toBeNull();
  });

  it("keeps the shell's structure: wordmark, subtitle, verify title, resend and the details divider carry their data-auth-* marks", async () => {
    mount();
    await settle();
    expect(document.querySelector("[data-auth-shell]")).not.toBeNull();
    expect(document.querySelector("[data-auth-wordmark]")?.textContent).toBe("UrbanOracle");
    expect(document.querySelector("[data-auth-subtitle]")?.textContent).toBe("Urban data visualization dashboard");
    expect(document.querySelector("[data-auth-verify-title]")?.textContent).toBe("Check your email");
    expect(document.querySelector("[data-auth-verify-resend]")?.textContent).toBe("Resend confirmation email");
    expect(document.querySelector("[data-auth-divider]")?.tagName).toBe("DETAILS");
  });

  it("anonymous: renders without redirecting — the placeholder address, a disabled resend, a way to sign in, no Sign out", async () => {
    h.auth.currentUser = null;
    mount();
    await settle();
    expect(h.router.replace).not.toHaveBeenCalled();
    expect(h.router.push).not.toHaveBeenCalled();
    expect(heading()).toBe("Check your email");
    expect(screen.getByText("your address").tagName).toBe("STRONG");
    expect((screen.getByRole("button", { name: "Resend confirmation email" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("link", { name: "Back to sign in" }).getAttribute("href")).toBe("/login");
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Wrong address? Sign up again" })).toBeNull();
    expect(mailPosts()).toEqual([]);
  });
});

describe("the one-shot auto-send (R-F2)", () => {
  it("with the flag: exactly one POST, even under StrictMode — with the reader's language and the ID token; the flag is gone", async () => {
    window.sessionStorage.setItem(FLAG, "1");
    mount(<VerifyEmailPage />, { strict: true });
    await vi.waitFor(() => expect(mailPosts().length).toBeGreaterThan(0));
    await settle();
    expect(mailPosts()).toEqual([{ url: ENDPOINT, body: { lang: "en" }, auth: "Bearer t" }]);
    expect(window.sessionStorage.getItem(FLAG)).toBeNull();
  });

  it("without the flag (a reload, the 403 redirect): nothing is posted", async () => {
    mount(<VerifyEmailPage />, { strict: true });
    await settle();
    expect(mailPosts()).toEqual([]);
  });

  it("a 'cooldown' answer is shown as sent, with the server's countdown", async () => {
    window.sessionStorage.setItem(FLAG, "1");
    h.answer = { status: 429, body: { detail: "cooldown", retry_after: 42 } };
    mount();
    expect((await screen.findByText(/You can resend in/)).textContent).toBe("You can resend in 42s");
    expect((screen.getByRole("button", { name: "Resend confirmation email" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("an 'already_verified' answer runs the verified flow at once", async () => {
    window.sessionStorage.setItem(FLAG, "1");
    h.answer = { status: 409, body: { detail: "already_verified" } };
    mount();
    expect((await screen.findByRole("heading", { level: 2, name: "Email address confirmed" })).textContent).toBe("Email address confirmed");
  });
});

describe("automatic detection (R-F3, R-F4) — fake timers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("a hidden tab reloads nothing over 12 s; becoming visible checks at once, then every 4 s", async () => {
    visibility = "hidden";
    mount();
    await advance(12_000);
    expect(h.auth.currentUser!.reload).toHaveBeenCalledTimes(0);
    await act(async () => setVisibility("visible"));
    await advance(0);
    expect(h.auth.currentUser!.reload).toHaveBeenCalledTimes(1);
    await advance(4000);
    expect(h.auth.currentUser!.reload).toHaveBeenCalledTimes(2);
    await act(async () => setVisibility("hidden"));
    await advance(12_000);
    expect(h.auth.currentUser!.reload, "hidden again: the polling stops").toHaveBeenCalledTimes(2);
  });

  it("visible: every 4 s; a focus checks at once — one reload", async () => {
    mount();
    await advance(3999);
    expect(h.auth.currentUser!.reload).toHaveBeenCalledTimes(0);
    await advance(1);
    expect(h.auth.currentUser!.reload).toHaveBeenCalledTimes(1);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await advance(0);
    expect(h.auth.currentUser!.reload).toHaveBeenCalledTimes(2);
  });

  it("nothing is left after unmount: no timer, and no listener reloads", async () => {
    const { unmount } = mount();
    await advance(0);
    unmount();
    expect(vi.getTimerCount(), "every timer cleared").toBe(0);
    setVisibility("visible");
    window.dispatchEvent(new Event("focus"));
    await advance(12_000);
    expect(h.auth.currentUser!.reload).toHaveBeenCalledTimes(0);
  });

  // Replaces the 15 s poll + 「認証を確認」 path of the previous /pending.
  it("verified → DETECTED for at least 1200 ms while getIdToken(true) and POST /api/v1/auth/re-evaluate run → /app", async () => {
    const user = h.auth.currentUser!;
    user.reload = vi.fn(async () => {
      user.emailVerified = true;
    });
    mount();
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await advance(0);
    expect(heading()).toBe("Email address confirmed");
    expect(screen.getByText("Confirmed")).toBeDefined();
    expect(user.getIdToken).toHaveBeenCalledWith(true);
    expect(reevaluatePosts()).toEqual([{ url: REEVALUATE, body: undefined, auth: "Bearer t" }]);
    await advance(1199);
    expect(h.router.replace).not.toHaveBeenCalled();
    await advance(1);
    expect(h.router.replace).toHaveBeenCalledWith("/app");
    expect(h.router.push).not.toHaveBeenCalled();
  });

  it("verified, but the forced token refresh fails: named on screen, logged, and nobody is navigated", async () => {
    const user = h.auth.currentUser!;
    const failure = firebaseFailure();
    user.reload = vi.fn(async () => {
      user.emailVerified = true;
    });
    user.getIdToken = vi.fn((force?: boolean) => (force ? Promise.reject(failure) : Promise.resolve("t")));
    mount();
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await advance(1300);
    const note = screen.getByRole("alert");
    expect(note.textContent).toContain("Could not confirm verification");
    expect(note.textContent).toContain("FirebaseError: Firebase: Error (auth/network-request-failed).");
    expect(h.router.replace).not.toHaveBeenCalled();
    expect(loggedWith(errors, "[urbanoracle] verify: could not confirm verification:")[0]?.[1]).toBe(failure);
  });

  it("verified, but re-evaluate answers a non-2xx: named on screen with the status, logged, no navigation", async () => {
    const user = h.auth.currentUser!;
    user.reload = vi.fn(async () => {
      user.emailVerified = true;
    });
    h.reevaluate = { status: 503, body: { detail: "db" } };
    mount();
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await advance(1300);
    const note = screen.getByRole("alert");
    expect(note.textContent).toContain("Could not confirm verification");
    expect(note.textContent).toContain("503");
    expect(h.router.replace).not.toHaveBeenCalled();
    expect(loggedWith(errors, "[urbanoracle] verify: could not confirm verification:").length).toBe(1);
  });

  it("an automatic check whose reload() fails is logged and retried on the next tick — never a navigation", async () => {
    const failure = firebaseFailure();
    h.auth.currentUser!.reload = vi.fn(() => Promise.reject(failure));
    mount();
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await advance(0);
    expect(loggedWith(warnings, "[urbanoracle] verify: automatic check failed")[0]?.[1]).toBe(failure);
    expect(heading()).toBe("Check your email");
    expect(h.router.replace).not.toHaveBeenCalled();
    await advance(4000);
    expect(h.auth.currentUser!.reload).toHaveBeenCalledTimes(2);
  });

  it("an automatic check that finds the address unverified changes nothing — no note, no navigation", async () => {
    window.localStorage.removeItem(STORAGE_KEY);
    mount();
    await advance(4000);
    expect(h.auth.currentUser!.reload).toHaveBeenCalledTimes(1);
    expect(heading()).toBe("メールを確認してください");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(h.router.replace).not.toHaveBeenCalled();
  });
});

describe("resend (R-F5)", () => {
  it("'Confirmation email sent again', the button disabled while the server's countdown runs, the seconds visible", async () => {
    vi.useFakeTimers();
    mount();
    await advance(0);
    fireEvent.click(screen.getByRole("button", { name: "Resend confirmation email" }));
    await advance(0);
    expect(mailPosts().length).toBe(1);
    expect(screen.getByText("Confirmation email sent again").getAttribute("role")).toBe("status");
    expect(screen.getByText(/You can resend in/).textContent).toBe("You can resend in 60s");
    const button = screen.getByRole("button", { name: "Resend confirmation email" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await advance(1000);
    expect(screen.getByText(/You can resend in/).textContent).toBe("You can resend in 59s");
    await advance(59_000);
    expect(screen.queryByText(/You can resend in/)).toBeNull();
    expect(button.disabled).toBe(false);
  });

  it("the daily limit, with its countdown", async () => {
    h.answer = { status: 429, body: { detail: "daily_limit", retry_after: 3600 } };
    mount();
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Resend confirmation email" }));
    expect(await screen.findByText("You've reached today's resend limit. Please try again later.")).toBeDefined();
    expect(screen.getByText(/You can resend in/).textContent).toBe("You can resend in 3600s");
  });

  it.each([
    ["a 503", { status: 503, body: { detail: "verification_unavailable" } } as Answer],
    ["a 502", { status: 502, body: { detail: "email_send_failed" } } as Answer],
    ["a network failure", "network" as Answer],
  ])("%s: 'We couldn't send...' (role alert), logged, no countdown", async (_name, answer) => {
    h.answer = answer;
    mount();
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Resend confirmation email" }));
    expect((await screen.findByRole("alert")).textContent).toBe("We couldn't send the confirmation email. Please try again in a little while.");
    expect(loggedWith(errors, "[urbanoracle] verify: the confirmation email could not be sent:").length).toBe(1);
    expect(screen.queryByText(/You can resend in/)).toBeNull();
  });
});

describe("the webmail shortcut (R-F6) and the way to sign up again (R-F7)", () => {
  it("a known domain gets its shortcut, in a new tab, noopener noreferrer", async () => {
    h.auth.currentUser = mockUser({ email: "someone@GMAIL.com" });
    mount();
    await settle();
    const link = screen.getByRole("link", { name: /Open Gmail/ });
    expect(link.getAttribute("href")).toBe("https://mail.google.com/mail/u/0/#search/from%3Anoreply%40send.dxalabs.com+in%3Aanywhere");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("any other domain gets none: the links are the way to sign up again and the way back to the landing page", async () => {
    mount();
    await settle();
    expect(Array.from(document.querySelectorAll("a[href]")).map((a) => a.getAttribute("href"))).toEqual(["/login", "/"]);
  });

  it("'Wrong address? Sign up again' signs out, then /login", async () => {
    mount();
    await settle();
    fireEvent.click(screen.getByRole("link", { name: "Wrong address? Sign up again" }));
    await vi.waitFor(() => expect(h.router.replace).toHaveBeenCalledWith("/login"));
    expect(h.signOut).toHaveBeenCalledTimes(1);
    expect(h.signOut.mock.invocationCallOrder[0]).toBeLessThan(h.router.replace.mock.invocationCallOrder[0]);
  });

  it("a sign-out that fails there says so, the user stays, and it is logged", async () => {
    const failure = firebaseFailure();
    h.signOut = vi.fn(() => Promise.reject(failure));
    mount();
    await settle();
    fireEvent.click(screen.getByRole("link", { name: "Wrong address? Sign up again" }));
    const note = await screen.findByRole("alert");
    expect(note.textContent).toContain("Sign-out failed");
    expect(note.textContent).toContain("FirebaseError: Firebase: Error (auth/network-request-failed).");
    expect(h.router.replace).not.toHaveBeenCalled();
    expect(loggedWith(errors, "[urbanoracle] sign-out failed:")[0]?.[1]).toBe(failure);
  });
});

describe("Sign out", () => {
  it("signs out with the app's auth instance, then replace('/login')", async () => {
    mount();
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await vi.waitFor(() => expect(h.router.replace).toHaveBeenCalledWith("/login"));
    expect(h.signOut).toHaveBeenCalledTimes(1);
    expect(h.router.push).not.toHaveBeenCalled();
  });

  it("a sign-out that fails says so, the user stays, and the error is logged", async () => {
    const failure = firebaseFailure();
    h.signOut = vi.fn(() => Promise.reject(failure));
    mount();
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    const note = await screen.findByRole("alert");
    expect(note.textContent).toContain("FirebaseError: Firebase: Error (auth/network-request-failed).");
    expect(h.router.replace).not.toHaveBeenCalled();
    expect(loggedWith(errors, "[urbanoracle] sign-out failed:")[0]?.[1]).toBe(failure);
  });
});

describe("/pending in Japanese — the default: the same paths, the dictionary's words", () => {
  beforeEach(() => window.localStorage.removeItem(STORAGE_KEY));

  it("the waiting screen in Japanese — and no 「認証を確認」 (R-F13)", async () => {
    mount();
    await settle();
    expect(heading()).toBe("メールを確認してください");
    expect(screen.getByText("確認を待っています")).toBeDefined();
    expect(screen.getByText("確認用のリンクを次のアドレスに送りました。")).toBeDefined();
    expect(screen.getByText("harness@example.com").tagName).toBe("STRONG");
    expect(screen.getByRole("link", { name: "アドレスが違う場合は登録し直す" }).getAttribute("href")).toBe("/login");
    expect(screen.getByText("メールの「メールアドレスを確認する」を押します。")).toBeDefined();
    expect(screen.getByText("この画面は自動で次へ進みます。スマホでメールを開いても大丈夫です。")).toBeDefined();
    expect(screen.getByRole("button", { name: "確認メールを再送" })).toBeDefined();
    const details = screen.getByText("メールが届かない場合").closest("details")!;
    expect(details.open).toBe(true);
    expect(details.textContent).toContain("迷惑メールフォルダを確認してください。送信元は noreply@send.dxalabs.com です。");
    expect(details.textContent).toContain(
      "携帯会社のメール（ドコモ・au・ソフトバンク）をお使いの場合は、send.dxalabs.com からの受信を許可してください。"
    );
    expect(details.textContent).toContain("会社のメールでは、セキュリティ確認のため届くまで数分かかることがあります。");
    expect(Array.from(details.querySelectorAll("code")).map((c) => c.textContent)).toEqual(["noreply@send.dxalabs.com", "send.dxalabs.com"]);
    expect(screen.getByRole("button", { name: "サインアウト" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "認証を確認" }), "R-F13").toBeNull();
  });

  it("resend: the note in Japanese, and it follows the toggle to English", async () => {
    mount();
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "確認メールを再送" }));
    await screen.findByText("確認メールを再送しました");
    fireEvent.click(screen.getByRole("button", { name: "EN", exact: true }));
    expect(await screen.findByText("Confirmation email sent again")).toBeDefined();
  });

  it("verified: 確認できました / メールアドレスを確認しました with the address, then /app", async () => {
    vi.useFakeTimers();
    const user = h.auth.currentUser!;
    user.reload = vi.fn(async () => {
      user.emailVerified = true;
    });
    mount();
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await advance(0);
    expect(screen.getByText("確認できました")).toBeDefined();
    expect(heading()).toBe("メールアドレスを確認しました");
    expect(screen.getByText("harness@example.com の確認が完了しました。")).toBeDefined();
    expect(screen.getByText("ダッシュボードを開いています")).toBeDefined();
    expect(screen.getByRole("link", { name: "ダッシュボードを開く" }).getAttribute("href")).toBe("/app");
    await advance(1200);
    expect(h.router.replace).toHaveBeenCalledWith("/app");
  });

  it("logout: a sign-out that fails says so in Japanese", async () => {
    h.signOut = () => Promise.reject(firebaseFailure());
    mount();
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "サインアウト" }));
    const note = await screen.findByRole("alert");
    expect(note.textContent).toContain("サインアウトできませんでした");
    expect(h.router.replace).not.toHaveBeenCalled();
  });

  it("while the address is not yet known, the box names the reader's registered address", async () => {
    h.auth.currentUser = null;
    mount();
    await settle();
    expect(screen.getByText("ご登録のメールアドレス").tagName).toBe("STRONG");
    expect(screen.getByRole("link", { name: "サインインに戻る" }).getAttribute("href")).toBe("/login");
  });

  it("a failed resend in Japanese, and it follows the toggle to English", async () => {
    h.answer = { status: 503, body: { detail: "verification_unavailable" } };
    mount();
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "確認メールを再送" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("確認メールを送信できませんでした。時間をおいてもう一度お試しください。");
    fireEvent.click(screen.getByRole("button", { name: "EN", exact: true }));
    await vi.waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("We couldn't send the confirmation email. Please try again in a little while.")
    );
  });
});
