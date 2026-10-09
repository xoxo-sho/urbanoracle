import { describe, expect, it } from "vitest";
import {
  SHARED_TENANT_EMAIL_IN_USE,
  authErrorCode,
  authErrorMessage,
  shouldDiscloseResetError,
  type AuthErrorCode,
} from "@/lib/auth-errors";
import { authErrorText } from "@/i18n/auth";

/**
 * auth-errors.ts returns codes; the screens turn a code into text in the
 * visitor's language. In Japanese every former message must render
 * byte-identically — the golden strings below are origin/main's
 * src/lib/auth-errors.ts, verbatim.
 */

const GOLDEN: [firebaseCode: string, code: AuthErrorCode, japanese: string][] = [
  ["auth/too-many-requests", "too-many-requests", "試行回数が上限に達しました。しばらく時間をおいて再度お試しください"],
  ["auth/invalid-email", "invalid-email", "メールアドレスの形式が正しくありません"],
  ["auth/email-already-in-use", "email-already-in-use", "他の DXA Labs プロダクトで登録済みのメールアドレスです。サインインしてください"],
  ["auth/invalid-credential", "invalid-credential", "メールアドレスまたはパスワードが正しくありません"],
  ["auth/wrong-password", "invalid-credential", "メールアドレスまたはパスワードが正しくありません"],
  ["auth/user-disabled", "user-disabled", "このアカウントは現在ご利用いただけません"],
  ["auth/weak-password", "weak-password", "パスワードが要件を満たしていません"],
  ["auth/popup-closed-by-user", "popup-closed-by-user", "サインインがキャンセルされました"],
  ["auth/popup-blocked", "popup-blocked", "ポップアップがブロックされました。ブラウザの設定をご確認ください"],
  ["auth/network-request-failed", "network-request-failed", "ネットワークに接続できませんでした。接続をご確認のうえ再度お試しください"],
  // Deliberately unmapped: an account-enumeration oracle (see auth-errors.ts).
  ["auth/user-not-found", "unknown", "処理を完了できませんでした。時間をおいて再度お試しください"],
  ["auth/some-unmapped-code", "unknown", "処理を完了できませんでした。時間をおいて再度お試しください"],
];

describe("auth error codes", () => {
  it.each(GOLDEN)("%s → %s → the former Japanese message, byte for byte", (firebaseCode, code, japanese) => {
    expect(authErrorCode({ code: firebaseCode })).toBe(code);
    expect(authErrorText(code, "ja")).toBe(japanese);
    expect(authErrorMessage({ code: firebaseCode })).toBe(japanese);
  });

  it("a non-error value is the fallback code", () => {
    expect(authErrorCode(null)).toBe("unknown");
    expect(authErrorCode("boom")).toBe("unknown");
  });

  it("every code has English text that differs from the Japanese", () => {
    for (const [, code] of GOLDEN) {
      const english = authErrorText(code, "en");
      expect(english.trim()).not.toBe("");
      expect(english).not.toBe(authErrorText(code, "ja"));
    }
  });

  it("the shared-tenant constant is still the Japanese in-use message", () => {
    expect(SHARED_TENANT_EMAIL_IN_USE).toBe(authErrorText("email-already-in-use", "ja"));
  });

  it("the reset form still discloses exactly the same three codes", () => {
    const disclosed = GOLDEN.map(([c]) => c).filter((c) => shouldDiscloseResetError({ code: c }));
    expect(disclosed).toEqual(["auth/too-many-requests", "auth/invalid-email", "auth/network-request-failed"]);
  });
});
