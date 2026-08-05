/**
 * Firebase client for the shared dxalabs-platform tenant.
 *
 * The config values are public identifiers, not secrets — access is decided
 * server-side by RS256 verification plus the curated is_active gate. They are
 * NEXT_PUBLIC_* because Next inlines them at build time (design-spec-v1 §2 of
 * the migration config: build-args, not runtime env).
 *
 * The defaults below are DUMMY values for local work before the real web app
 * exists (Stage 5). They are intentionally not any of the placeholder strings
 * the bundle verifier rejects, so a structural build stays distinguishable
 * from a build that simply lost its arguments — but they are equally
 * intentionally not a usable Firebase config: sign-in against them fails.
 */

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

const DUMMY = "dev-config-not-real";

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? DUMMY,
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "dxalabs-platform.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "dxalabs-platform",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? DUMMY,
};

/** True when running against dummy config — the sign-in path cannot succeed. */
export function isDummyConfig(): boolean {
  return firebaseConfig.apiKey === DUMMY || firebaseConfig.appId === DUMMY;
}

export const BUILD_SHA = process.env.NEXT_PUBLIC_BUILD_SHA ?? "dev";

let app: FirebaseApp | null = null;

export function firebaseApp(): FirebaseApp {
  if (!app) {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  }
  return app;
}

/** Auth is browser-only; calling this during SSR is a programming error. */
export function firebaseAuth(): Auth {
  return getAuth(firebaseApp());
}
