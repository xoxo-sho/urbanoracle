/**
 * Firebase auth error codes → Japanese copy (design-spec-v1 §6).
 *
 * The messages are written for the person reading them, not for the console.
 * In particular `auth/email-already-in-use` has to explain a consequence of
 * the shared dxalabs-platform tenant: the address is registered because the
 * person already has a DXA Labs account somewhere else, and the fix is to
 * sign in rather than to pick a different address.
 */

export const SHARED_TENANT_EMAIL_IN_USE =
  "他の DXA Labs プロダクトで登録済みのメールアドレスです。サインインしてください";

const MESSAGES: Record<string, string> = {
  "auth/too-many-requests":
    "試行回数が上限に達しました。しばらく時間をおいて再度お試しください",
  "auth/invalid-email": "メールアドレスの形式が正しくありません",
  "auth/email-already-in-use": SHARED_TENANT_EMAIL_IN_USE,
  "auth/invalid-credential":
    "メールアドレスまたはパスワードが正しくありません",
  "auth/wrong-password": "メールアドレスまたはパスワードが正しくありません",
  "auth/user-disabled": "このアカウントは現在ご利用いただけません",
  "auth/weak-password": "パスワードが要件を満たしていません",
  "auth/popup-closed-by-user": "サインインがキャンセルされました",
  "auth/popup-blocked":
    "ポップアップがブロックされました。ブラウザの設定をご確認ください",
  "auth/network-request-failed":
    "ネットワークに接続できませんでした。接続をご確認のうえ再度お試しください",
};

/**
 * `auth/user-not-found` is deliberately absent: telling a caller that an
 * address is unregistered is an account-enumeration oracle. The reset flow
 * never surfaces it (see /forgot-password), and anywhere else it falls back
 * to the generic message below.
 */
const FALLBACK = "処理を完了できませんでした。時間をおいて再度お試しください";

/**
 * Codes the password-reset form may show, because they say nothing about
 * whether the address is registered.
 *
 * Everything else — `auth/user-not-found` above all — resolves to the same
 * confirmation screen as success. On a shared tenant, an "unknown address"
 * message would leak account existence across every DXA Labs product at once.
 */
const RESET_DISCLOSABLE = new Set([
  "auth/too-many-requests",
  "auth/invalid-email",
  "auth/network-request-failed",
]);

export function errorCodeOf(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : "";
}

/** False means: show the confirmation screen, regardless of what happened. */
export function shouldDiscloseResetError(error: unknown): boolean {
  return RESET_DISCLOSABLE.has(errorCodeOf(error));
}

export function authErrorMessage(error: unknown): string {
  return MESSAGES[errorCodeOf(error)] ?? FALLBACK;
}
