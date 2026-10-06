import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { User } from "firebase/auth";

/**
 * Sign-out — the platform pattern (Landcast UserMenu, DisasterShield
 * RequireAuth, PropScore Layout) applied to UrbanOracle.
 *
 * firebase/auth is mocked at the module boundary: no identity host is
 * contacted, and the session is driven by firing the callback the provider
 * registers with onAuthStateChanged. Only the jsdom-hostile parts of the
 * dashboard are stubbed (MapLibre canvas, theme store, gated fetch) — the same
 * stubs dashboard-page.test.tsx uses — so the header under test is the real
 * one, inside the real AuthProvider.
 *
 *   (a) signed in  → 「サインアウト」 and the signed-in e-mail render on /app,
 *                    the only authenticated screen
 *   (b) click      → signOut called exactly once, with the app's own auth
 *                    instance (firebaseAuth())
 *   (c)            → router.replace("/login"); push is never called
 *   (e) anonymous  → nothing renders: /app shows sample data to anyone, so
 *                    the control must not imply a session that does not exist
 *   (f) /pending   → 「別のアカウントでサインインする」: signOut, then
 *                    replace("/login") — mirroring urbanagents' verify screen
 */

const h = vi.hoisted(() => ({
  router: { replace: vi.fn(), push: vi.fn(), prefetch: vi.fn(), back: vi.fn() },
  listeners: [] as Array<(user: unknown) => void>,
  FAKE_AUTH: { name: "the-app-auth-instance", currentUser: null as unknown },
  signOut: vi.fn(async () => undefined),
}));

vi.mock("next/navigation", () => ({ useRouter: () => h.router }));
vi.mock("next/dynamic", () => ({
  default: () =>
    function MapStub() {
      return <div data-testid="map-stub" />;
    },
}));
vi.mock("@/components/dashboard/ThemeToggle", () => ({ default: () => null }));
vi.mock("@/lib/use-gated-data", () => ({
  useGatedData: (_endpoint: string, fallback: unknown) => ({
    data: fallback,
    isLoading: false,
    isLive: false,
  }),
}));
// firebase/app: firebaseApp() only needs an object to hand to getAuth().
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
  signOut: h.signOut,
  sendEmailVerification: vi.fn(async () => undefined),
}));

import { AuthProvider } from "@/lib/auth-context";
import { firebaseAuth } from "@/lib/firebase";
import Home from "@/app/app/page";
import VerifyEmailPage from "@/app/pending/page";

const SIGNED_IN = {
  uid: "uid-1",
  email: "sho@example.com",
  emailVerified: true,
} as unknown as User;
const UNVERIFIED = { ...SIGNED_IN, emailVerified: false } as unknown as User;

const SIGN_OUT = { name: "サインアウト" };
const SWITCH_ACCOUNT = { name: "別のアカウントでサインインする" };

/** What Firebase would do: tell every subscriber the session changed. */
function fireAuthState(user: User | null) {
  act(() => {
    for (const next of [...h.listeners]) next(user);
  });
}

function mount(ui: ReactNode) {
  return render(<AuthProvider>{ui}</AuthProvider>);
}

beforeEach(() => {
  h.listeners = [];
  h.router.replace.mockClear();
  h.router.push.mockClear();
  h.signOut.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("/app — the signed-in header", () => {
  it("(a) renders 「サインアウト」 and the signed-in e-mail once the session resolves", async () => {
    mount(<Home />);
    fireAuthState(SIGNED_IN);

    const button = await screen.findByRole("button", SIGN_OUT);
    expect(button).toBeVisible();
    expect(button).toHaveTextContent("サインアウト");
    expect(screen.getByText("sho@example.com")).toBeVisible();
  });

  it("(e) renders neither the control nor an e-mail while loading, nor for an anonymous visitor", () => {
    mount(<Home />);
    // Loading: Firebase has not reported yet — the gap must not look like a session.
    expect(screen.queryByRole("button", SIGN_OUT)).toBeNull();

    fireAuthState(null);
    expect(screen.queryByRole("button", SIGN_OUT)).toBeNull();
    expect(screen.queryByText("sho@example.com")).toBeNull();
    // The dashboard itself still renders for anonymous visitors (sample data).
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("UrbanOracle");
  });

  it("(b)(c) click → signOut once with the app's auth instance, then router.replace('/login'); push never", async () => {
    mount(<Home />);
    fireAuthState(SIGNED_IN);

    fireEvent.click(await screen.findByRole("button", SIGN_OUT));

    await waitFor(() => expect(h.router.replace).toHaveBeenCalledWith("/login"));
    expect(h.signOut).toHaveBeenCalledTimes(1);
    expect(h.signOut).toHaveBeenCalledWith(h.FAKE_AUTH);
    expect(h.signOut).toHaveBeenCalledWith(firebaseAuth());
    expect(h.router.replace).toHaveBeenCalledTimes(1);
    expect(h.router.push).not.toHaveBeenCalled();
    // The session is dropped before the browser leaves the page.
    expect(h.signOut.mock.invocationCallOrder[0]).toBeLessThan(
      h.router.replace.mock.invocationCallOrder[0],
    );
  });

  it("stays put when Firebase fails to clear the session — no false sign-out on a shared machine", async () => {
    h.signOut.mockRejectedValueOnce(new Error("auth/network-request-failed"));
    mount(<Home />);
    fireAuthState(SIGNED_IN);

    fireEvent.click(await screen.findByRole("button", SIGN_OUT));

    await waitFor(() => expect(h.signOut).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(h.router.replace).not.toHaveBeenCalled();
    expect(h.router.push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", SIGN_OUT)).toBeEnabled();
    expect(screen.getByText("sho@example.com")).toBeVisible();
  });
});

describe("/pending — the escape hatch", () => {
  it("(f) 「別のアカウントでサインインする」 signs out with the app's auth instance, then replace('/login')", async () => {
    mount(<VerifyEmailPage />);
    fireAuthState(UNVERIFIED);

    fireEvent.click(await screen.findByRole("button", SWITCH_ACCOUNT));

    await waitFor(() => expect(h.router.replace).toHaveBeenCalledWith("/login"));
    expect(h.signOut).toHaveBeenCalledTimes(1);
    expect(h.signOut).toHaveBeenCalledWith(firebaseAuth());
    expect(h.router.replace).toHaveBeenCalledTimes(1);
    expect(h.router.push).not.toHaveBeenCalled();
    expect(h.signOut.mock.invocationCallOrder[0]).toBeLessThan(
      h.router.replace.mock.invocationCallOrder[0],
    );
  });

  it("(e) the hatch is not offered to an anonymous visitor", () => {
    mount(<VerifyEmailPage />);
    fireAuthState(null);
    expect(screen.queryByRole("button", SWITCH_ACCOUNT)).toBeNull();
  });
});
