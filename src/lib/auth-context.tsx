"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase";

/**
 * Session state for the client (design-spec-v1 §5, §6).
 *
 * `loading` is a distinct state from "signed out" on purpose: Firebase
 * resolves the persisted session asynchronously, and treating the gap as
 * signed-out would bounce every returning visitor to /login for a moment
 * before bouncing them back.
 */

interface AuthState {
  user: User | null;
  loading: boolean;
  /** Fresh ID token, or null when signed out. */
  getToken: (forceRefresh?: boolean) => Promise<string | null>;
  /** Re-reads the user record from the IdP (used to detect verification). */
  refresh: () => Promise<User | null>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // The provider wraps the public landing page too, so a misconfigured or
    // unreachable IdP must degrade to "signed out" rather than take down a
    // page that needs no authentication at all. Failing closed here means
    // no session, which the gates already handle.
    let active = true;
    const fail = () => {
      if (!active) return;
      setUser(null);
      setLoading(false);
    };

    try {
      const unsubscribe = onAuthStateChanged(
        firebaseAuth(),
        (next) => {
          setUser(next);
          setLoading(false);
        },
        // Async failures arrive here rather than as a throw.
        fail
      );
      return () => {
        active = false;
        unsubscribe();
      };
    } catch {
      // getAuth() itself threw. Report on the next tick so the effect body
      // never sets state synchronously.
      queueMicrotask(fail);
      return () => {
        active = false;
      };
    }
  }, []);

  const getToken = useCallback(async (forceRefresh = false) => {
    try {
      const current = firebaseAuth().currentUser;
      if (!current) return null;
      return await current.getIdToken(forceRefresh);
    } catch {
      // No usable token is indistinguishable from being signed out, and the
      // gate treats it that way — never as an accidental grant.
      return null;
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const current = firebaseAuth().currentUser;
      if (!current) return null;
      await current.reload();
      const reloaded = firebaseAuth().currentUser;
      setUser(reloaded);
      return reloaded;
    } catch {
      return null;
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, getToken, refresh }),
    [user, loading, getToken, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
