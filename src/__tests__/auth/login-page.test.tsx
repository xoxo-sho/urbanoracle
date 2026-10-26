import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

/**
 * L9 — auth parity, as rebuilt for Stage 2 (the product's own verification
 * mail). The split screens must call exactly this, in this order:
 *
 *   email sign-in   signInWithEmailAndPassword(auth, email, password); a
 *                   verified account → push("/app"); an unverified one → the
 *                   one-shot flag, then push("/pending")
 *   email sign-up   the one-shot flag, then createUserWithEmailAndPassword
 *                   (auth, email, password) → push("/pending"); NEVER
 *                   sendEmailVerification (the backend sends the mail); a
 *                   creation that throws removes the flag
 *   weak password   no Firebase call; the requirement message
 *   Google          signInWithPopup(auth, GoogleAuthProvider) → push("/app")
 *   forgot          a link to /forgot-password (sign-in mode)
 *   register toggle in place: no navigation, no Firebase call
 *   errors          the code's Japanese message, verbatim
 *   /pending        「サインアウト」: signOut(auth) → replace("/login")
 *
 * firebase/auth is mocked; the auth instance is a sentinel so "the same
 * auth" is checked by identity.
 */

const h = vi.hoisted(() => ({
  router: { replace: vi.fn(), push: vi.fn(), prefetch: vi.fn(), back: vi.fn() },
  listeners: [] as Array<(user: unknown) => void>,
  FAKE_AUTH: { name: "the-app-auth-instance", currentUser: null as unknown, authStateReady: async () => undefined },
  CREDENTIAL_USER: { uid: "new-user", email: "new@example.com" },
  signInWithEmailAndPassword: vi.fn(async () => ({ user: { uid: "u1", emailVerified: true } })),
  createUserWithEmailAndPassword: vi.fn(async () => ({ user: { uid: "new-user", email: "new@example.com" } })),
  sendEmailVerification: vi.fn(async () => undefined),
  signInWithPopup: vi.fn(async () => ({ user: { uid: "g1" } })),
  signOut: vi.fn(async () => undefined),
  applyActionCode: vi.fn(async () => undefined),
  providers: [] as unknown[],
}));

vi.mock("next/navigation", () => ({ useRouter: () => h.router }));
vi.mock("firebase/app", () => ({
  getApps: () => [],
  getApp: () => ({}),
  initializeApp: () => ({}),
}));
vi.mock("firebase/auth", () => ({
  getAuth: () => h.FAKE_AUTH,
  onAuthStateChanged: (_auth: unknown, next: (user: unknown) => void) => {
    h.listeners.push(next);
    return () => {
      h.listeners = h.listeners.filter((l) => l !== next);
    };
  },
  GoogleAuthProvider: class GoogleAuthProvider {
    constructor() {
      h.providers.push(this);
    }
  },
  signInWithEmailAndPassword: h.signInWithEmailAndPassword,
  createUserWithEmailAndPassword: h.createUserWithEmailAndPassword,
  sendEmailVerification: h.sendEmailVerification,
  signInWithPopup: h.signInWithPopup,
  signOut: h.signOut,
  applyActionCode: h.applyActionCode,
}));

import LoginPage from "@/app/login/page";
import VerifyEmailPage from "@/app/pending/page";
import { AuthProvider } from "@/lib/auth-context";
import { firebaseAuth } from "@/lib/firebase";

const EMAIL = "sho@example.com";
const PASSWORD = "correct-horse-1";
const FLAG = "urbanoracle.verify.autoSend";

function mount(ui: ReactNode) {
  return render(<AuthProvider>{ui}</AuthProvider>);
}

function fill(email: string, password: string) {
  fireEvent.change(screen.getByLabelText("メールアドレス"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("パスワード"), { target: { value: password } });
}

function submit(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}

beforeEach(() => {
  h.listeners = [];
  h.providers = [];
  for (const fn of [
    h.router.replace,
    h.router.push,
    h.signInWithEmailAndPassword,
    h.createUserWithEmailAndPassword,
    h.sendEmailVerification,
    h.signInWithPopup,
    h.signOut,
  ]) {
    fn.mockClear();
  }
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("/login — the same Firebase calls as origin/main", () => {
  it("email sign-in (verified): signInWithEmailAndPassword(auth, email, password), then push('/app'); no flag", async () => {
    mount(<LoginPage />);
    fill(EMAIL, PASSWORD);
    submit("サインイン");
    await waitFor(() => expect(h.router.push).toHaveBeenCalledWith("/app"));
    expect(h.signInWithEmailAndPassword).toHaveBeenCalledTimes(1);
    expect(h.signInWithEmailAndPassword).toHaveBeenCalledWith(firebaseAuth(), EMAIL, PASSWORD);
    expect(h.router.push).toHaveBeenCalledTimes(1);
    expect(h.createUserWithEmailAndPassword).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(FLAG)).toBeNull();
  });

  it("email sign-in (unverified): the one-shot flag, then push('/pending') — the verify screen sends the mail", async () => {
    h.signInWithEmailAndPassword.mockResolvedValueOnce({ user: { uid: "u1", emailVerified: false } });
    mount(<LoginPage />);
    fill(EMAIL, PASSWORD);
    submit("サインイン");
    await waitFor(() => expect(h.router.push).toHaveBeenCalledWith("/pending"));
    expect(window.sessionStorage.getItem(FLAG)).toBe("1");
    expect(h.sendEmailVerification).not.toHaveBeenCalled();
  });

  // Replaces "email sign-up: createUserWithEmailAndPassword → sendEmailVerification(credential.user) → push('/pending')".
  it("email sign-up: the flag is set BEFORE createUserWithEmailAndPassword, no sendEmailVerification, then push('/pending')", async () => {
    let flagAtCreation: string | null = "unset";
    h.createUserWithEmailAndPassword.mockImplementationOnce(async () => {
      flagAtCreation = window.sessionStorage.getItem(FLAG);
      return { user: { uid: "new-user", email: "new@example.com" } };
    });
    mount(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: "アカウントをお持ちでない方" }));
    fill(EMAIL, PASSWORD);
    submit("アカウントを作成");
    await waitFor(() => expect(h.router.push).toHaveBeenCalledWith("/pending"));
    expect(h.createUserWithEmailAndPassword).toHaveBeenCalledWith(firebaseAuth(), EMAIL, PASSWORD);
    expect(flagAtCreation, "set immediately before the account is created").toBe("1");
    expect(window.sessionStorage.getItem(FLAG), "left for /pending to consume").toBe("1");
    expect(h.sendEmailVerification).not.toHaveBeenCalled();
    expect(h.signInWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it("email sign-up that throws: the flag is removed, the message shown, no navigation", async () => {
    h.createUserWithEmailAndPassword.mockRejectedValueOnce({ code: "auth/email-already-in-use" });
    mount(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: "アカウントをお持ちでない方" }));
    fill(EMAIL, PASSWORD);
    submit("アカウントを作成");
    expect(await screen.findByRole("alert")).toHaveTextContent("他の DXA Labs プロダクトで登録済みのメールアドレスです。サインインしてください");
    expect(window.sessionStorage.getItem(FLAG)).toBeNull();
    expect(h.router.push).not.toHaveBeenCalled();
    expect(h.sendEmailVerification).not.toHaveBeenCalled();
  });

  it("sign-up with a weak password: no Firebase call, the requirement message", async () => {
    mount(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: "アカウントをお持ちでない方" }));
    fill(EMAIL, "short");
    submit("アカウントを作成");
    expect(await screen.findByRole("alert")).toHaveTextContent("パスワードが要件を満たしていません");
    expect(h.createUserWithEmailAndPassword).not.toHaveBeenCalled();
    expect(h.router.push).not.toHaveBeenCalled();
  });

  it("Google: signInWithPopup(auth, a GoogleAuthProvider), then push('/app')", async () => {
    mount(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: "Google でサインイン" }));
    await waitFor(() => expect(h.router.push).toHaveBeenCalledWith("/app"));
    expect(h.signInWithPopup).toHaveBeenCalledTimes(1);
    expect(h.signInWithPopup).toHaveBeenCalledWith(firebaseAuth(), h.providers[0]);
    expect(h.providers).toHaveLength(1);
  });

  it("forgot: a link to /forgot-password in sign-in mode", () => {
    mount(<LoginPage />);
    const links = screen.getAllByRole("link").filter((a) => a.getAttribute("href") === "/forgot-password");
    expect(links).toHaveLength(1);
  });

  it("register toggle: switches in place — no navigation, no Firebase call, and back", () => {
    mount(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: "アカウントをお持ちでない方" }));
    expect(screen.getByRole("button", { name: "アカウントを作成" })).toBeInTheDocument();
    expect(screen.getByLabelText("パスワード")).toHaveAttribute("autocomplete", "new-password");
    fireEvent.click(screen.getByRole("button", { name: "既にアカウントをお持ちの方" }));
    expect(screen.getByLabelText("パスワード")).toHaveAttribute("autocomplete", "current-password");
    expect(h.router.push).not.toHaveBeenCalled();
    expect(h.router.replace).not.toHaveBeenCalled();
    for (const fn of [h.signInWithEmailAndPassword, h.createUserWithEmailAndPassword, h.signInWithPopup]) {
      expect(fn).not.toHaveBeenCalled();
    }
  });

  it.each([
    ["auth/invalid-credential", "メールアドレスまたはパスワードが正しくありません"],
    ["auth/too-many-requests", "試行回数が上限に達しました。しばらく時間をおいて再度お試しください"],
    ["auth/user-not-found", "処理を完了できませんでした。時間をおいて再度お試しください"],
  ])("a %s failure shows its Japanese message, verbatim", async (code, message) => {
    h.signInWithEmailAndPassword.mockRejectedValueOnce({ code });
    mount(<LoginPage />);
    fill(EMAIL, PASSWORD);
    submit("サインイン");
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(h.router.push).not.toHaveBeenCalled();
  });
});

describe("/pending — the way out", () => {
  // Replaces "「別のアカウントでサインインする」: signOut(auth), then replace('/login')".
  it("「サインアウト」: signOut(auth), then replace('/login')", async () => {
    mount(<VerifyEmailPage />);
    await act(async () => {
      for (const l of h.listeners) l({ uid: "u2", email: EMAIL, emailVerified: false, getIdToken: async () => "t", reload: async () => undefined });
    });
    fireEvent.click(await screen.findByRole("button", { name: "サインアウト" }));
    await waitFor(() => expect(h.router.replace).toHaveBeenCalledWith("/login"));
    expect(h.signOut).toHaveBeenCalledWith(firebaseAuth());
    expect(h.signOut.mock.invocationCallOrder[0]).toBeLessThan(h.router.replace.mock.invocationCallOrder[0]);
    expect(h.router.push).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "別のアカウントでサインインする" })).toBeNull();
    expect(screen.queryByRole("button", { name: "認証を確認" }), "D2: no manual check button").toBeNull();
  });
});
