import { StrictMode, type ComponentType } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEY } from "@/i18n/lang";

/**
 * /auth/action (Stage 2): the link in UrbanOracle's verification mail,
 *   /auth/action?mode=verifyEmail&oobCode=<code>&lang=<ja|en>
 *   R-F8   signed in here: applyActionCode once (even under StrictMode),
 *          reload, getIdToken(true), POST /api/v1/auth/re-evaluate, SAME,
 *          then /app after 2 s ("Open now" at once); the code leaves the
 *          address bar on the first render
 *   R-F9   no session here: OTHER, with the way to sign in on this device
 *   R-F10  a used or expired code: signed in and verified anyway → SAME;
 *          signed in, unverified → EXPIRED_SIGNED_IN, whose button asks for a
 *          new mail and then goes to /pending; no session → EXPIRED, to /login
 *   R-F11  no code, or another mode → INVALID; a network failure → ERROR,
 *          whose button re-applies the same code
 *   R-F12  lang=en in the link renders English and stores nothing — this
 *          product's LanguageProvider otherwise persists ?lang=
 *
 * The page module is imported inside each test (loadPage), so that before it
 * exists each test fails on its own line.
 */

type MockUser = {
  email: string;
  emailVerified: boolean;
  reload: () => Promise<void>;
  getIdToken: (force?: boolean) => Promise<string>;
};

const h = vi.hoisted(() => ({
  auth: {
    name: "the-app-auth-instance",
    currentUser: null as MockUser | null,
    authStateReady: () => Promise.resolve(),
  },
  router: { replace: vi.fn(), push: vi.fn(), prefetch: vi.fn(), back: vi.fn() },
  applyActionCode: vi.fn(),
  posts: [] as { url: string; body: unknown; auth: string | null }[],
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
  applyActionCode: (...args: unknown[]) => h.applyActionCode(...args),
  signOut: () => Promise.reject(new Error("/auth/action never signs out")),
  sendEmailVerification: () => Promise.reject(new Error("Stage 2: the client never sends the verification mail")),
}));

const PAGE = "../../app/auth/action/page";
const loadPage = async (): Promise<ComponentType> => ((await import(/* @vite-ignore */ PAGE)) as { default: ComponentType }).default;

const firebaseError = (code: string) => Object.assign(new Error(`Firebase: Error (${code}).`), { name: "FirebaseError", code });

function signedIn(over: Partial<MockUser> = {}): MockUser {
  return {
    email: "harness@example.com",
    emailVerified: false,
    reload: vi.fn(() => Promise.resolve()),
    getIdToken: vi.fn(() => Promise.resolve("t")),
    ...over,
  };
}

async function open(search: string, { strict = false } = {}) {
  window.history.replaceState({}, "", `/auth/action${search}`);
  const Page = await loadPage();
  render(
    strict ? (
      <StrictMode>
        <Page />
      </StrictMode>
    ) : (
      <Page />
    )
  );
}

const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
const heading = () => screen.getByRole("heading", { level: 1 }).textContent;
const mailPosts = () => h.posts.filter((p) => p.url === "/api/v1/auth/verification-email");
const reevaluatePosts = () => h.posts.filter((p) => p.url === "/api/v1/auth/re-evaluate");

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  h.auth.currentUser = null;
  h.router.replace.mockClear();
  h.router.push.mockClear();
  h.applyActionCode = vi.fn(() => Promise.resolve());
  h.posts = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      h.posts.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined, auth: headers["Authorization"] ?? null });
      return { ok: true, status: 200, statusText: "", text: async () => "{}", json: async () => ({ sent: true, retry_after: 60 }) } as unknown as Response;
    })
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.history.replaceState({}, "", "/");
  document.documentElement.lang = "ja";
});

describe("a good code (R-F8, R-F9)", () => {
  it("R-F8 signed in: applyActionCode once under StrictMode, reload, getIdToken(true), re-evaluate, SAME, then /app after 2 s; the code is out of the address bar", async () => {
    const user = signedIn();
    h.auth.currentUser = user;
    await open("?mode=verifyEmail&oobCode=CODE-1&lang=ja", { strict: true });
    expect(window.location.search, "the code leaves the address bar on the first render").toBe("");
    expect(window.location.pathname).toBe("/auth/action");
    await advance(0);
    expect(h.applyActionCode).toHaveBeenCalledTimes(1);
    expect(h.applyActionCode.mock.calls[0][0]).toBe(h.auth);
    expect(h.applyActionCode.mock.calls[0][1]).toBe("CODE-1");
    expect(user.reload).toHaveBeenCalled();
    expect(user.getIdToken).toHaveBeenCalledWith(true);
    expect(reevaluatePosts()).toEqual([{ url: "/api/v1/auth/re-evaluate", body: undefined, auth: "Bearer t" }]);
    expect(heading()).toBe("メールアドレスを確認しました");
    expect(screen.getByText("まもなくダッシュボードへ移動します。")).toBeDefined();
    await advance(1999);
    expect(h.router.replace).not.toHaveBeenCalled();
    await advance(1);
    expect(h.router.replace).toHaveBeenCalledWith("/app");
  });

  it("R-F8 'Open now' goes at once", async () => {
    h.auth.currentUser = signedIn();
    await open("?mode=verifyEmail&oobCode=CODE-2&lang=ja");
    await advance(0);
    fireEvent.click(screen.getByRole("button", { name: "今すぐ開く" }));
    await advance(0);
    expect(h.router.replace).toHaveBeenCalledWith("/app");
  });

  it("R-F9 no session here: OTHER, the diagram, and the way to sign in on this device", async () => {
    await open("?mode=verifyEmail&oobCode=CODE-3&lang=ja");
    await advance(0);
    expect(h.applyActionCode).toHaveBeenCalledTimes(1);
    expect(heading()).toBe("確認が完了しました");
    expect(screen.getByText("UrbanOracle を開いている元の画面は、自動で次へ進みます。この画面は閉じてかまいません。")).toBeDefined();
    expect(screen.getByRole("img", { name: "この端末で確認すると、元の画面が進みます" })).toBeDefined();
    expect(screen.getByRole("link", { name: "この端末で続ける" }).getAttribute("href")).toBe("/login");
    expect(screen.getByText("ログイン画面が開きます")).toBeDefined();
    expect(screen.getByRole("link", { name: "contact@dxalabs.com" }).getAttribute("href")).toBe("mailto:contact@dxalabs.com");
    await advance(5000);
    expect(h.router.replace, "nothing moves by itself here").not.toHaveBeenCalled();
  });
});

describe("a used or expired code (R-F10)", () => {
  it.each(["auth/invalid-action-code", "auth/expired-action-code"])("%s, signed in and verified anyway → SAME", async (code) => {
    const user = signedIn();
    user.reload = vi.fn(async () => {
      user.emailVerified = true;
    });
    h.auth.currentUser = user;
    h.applyActionCode = vi.fn(() => Promise.reject(firebaseError(code)));
    await open("?mode=verifyEmail&oobCode=USED&lang=ja");
    await advance(0);
    expect(heading()).toBe("メールアドレスを確認しました");
    expect(user.getIdToken).toHaveBeenCalledWith(true);
    await advance(2000);
    expect(h.router.replace).toHaveBeenCalledWith("/app");
  });

  it("signed in, still unverified → EXPIRED_SIGNED_IN; its button asks for a new mail, then /pending", async () => {
    h.auth.currentUser = signedIn();
    h.applyActionCode = vi.fn(() => Promise.reject(firebaseError("auth/expired-action-code")));
    await open("?mode=verifyEmail&oobCode=OLD&lang=ja");
    await advance(0);
    expect(heading()).toBe("このリンクは使えなくなっています");
    fireEvent.click(screen.getByRole("button", { name: "新しいリンクを送る" }));
    await advance(0);
    expect(mailPosts()).toEqual([{ url: "/api/v1/auth/verification-email", body: { lang: "ja" }, auth: "Bearer t" }]);
    expect(h.router.replace).toHaveBeenCalledWith("/pending");
  });

  it("no session → EXPIRED, with the way to sign in", async () => {
    h.applyActionCode = vi.fn(() => Promise.reject(firebaseError("auth/invalid-action-code")));
    await open("?mode=verifyEmail&oobCode=USED&lang=ja");
    await advance(0);
    expect(heading()).toBe("このリンクは使えなくなっています");
    expect(screen.getByText("有効期限が切れたか、すでに使われたリンクです。確認が済んでいれば、そのままログインできます。")).toBeDefined();
    expect(screen.getByRole("link", { name: "ログインして確認する" }).getAttribute("href")).toBe("/login");
    expect(screen.getByText("ログイン後、まだ確認が済んでいなければ、新しいリンクをその場でお送りします。")).toBeDefined();
  });
});

describe("a link that cannot work (R-F11)", () => {
  it.each([
    ["no code", "?mode=verifyEmail&lang=ja"],
    ["another mode", "?mode=resetPassword&oobCode=X&lang=ja"],
    ["nothing at all", ""],
  ])("%s → INVALID, nothing applied", async (_name, search) => {
    await open(search);
    await advance(0);
    expect(heading()).toBe("このリンクは開けません");
    expect(h.applyActionCode).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "ログイン" }).getAttribute("href")).toBe("/login");
  });

  it("a network failure → ERROR; 'Try again' re-applies the same code", async () => {
    h.applyActionCode = vi.fn(() => Promise.reject(firebaseError("auth/network-request-failed")));
    await open("?mode=verifyEmail&oobCode=KEEP-ME&lang=ja");
    await advance(0);
    expect(heading()).toBe("確認できませんでした");
    expect(screen.getByText("通信に失敗しました。もう一度お試しください。")).toBeDefined();
    h.applyActionCode = vi.fn(() => Promise.resolve());
    fireEvent.click(screen.getByRole("button", { name: "もう一度試す" }));
    await advance(0);
    expect(h.applyActionCode).toHaveBeenCalledTimes(1);
    expect(h.applyActionCode.mock.calls[0][1]).toBe("KEEP-ME");
    expect(heading()).toBe("確認が完了しました");
  });
});

describe("the link's language (R-F12)", () => {
  it("lang=en renders English and stores nothing", async () => {
    await open("?mode=verifyEmail&oobCode=CODE-EN&lang=en");
    await advance(0);
    expect(heading()).toBe("You're confirmed");
    expect(screen.getByRole("link", { name: "Continue on this device" })).toBeDefined();
    expect(window.localStorage.getItem(STORAGE_KEY), "the link's language is not stored").toBeNull();
    expect(document.documentElement.lang).toBe("en");
  });

  it("lang=ja over a stored English: Japanese for this page, the stored choice untouched", async () => {
    window.localStorage.setItem(STORAGE_KEY, "en");
    await open("?mode=verifyEmail&oobCode=CODE-JA&lang=ja");
    await advance(0);
    expect(heading()).toBe("確認が完了しました");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("en");
  });

  it("a press on the EN toggle hands the page back to the stored choice, and stores it", async () => {
    await open("?mode=verifyEmail&oobCode=CODE-T&lang=ja");
    await advance(0);
    expect(heading()).toBe("確認が完了しました");
    fireEvent.click(screen.getByRole("button", { name: "EN", exact: true }));
    await advance(0);
    expect(heading()).toBe("You're confirmed");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("en");
  });
});
