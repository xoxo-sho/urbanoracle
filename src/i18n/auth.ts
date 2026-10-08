import type { Lang } from "@/i18n/lang";
import type { AuthErrorCode } from "@/lib/auth-errors";

/**
 * Every string the auth screens render — /login (both modes), /pending and
 * /forgot-password — plus auth-errors' messages and the password checklist,
 * in Japanese and English.
 *
 * `ja` is the source of truth and reads exactly as the screens did before
 * they had a language. `en` is declared with `satisfies`, and AUTH_KEYS_MATCH
 * fails `tsc` / `next build` if either side has a key the other lacks
 * (the same rules as src/i18n/lp.ts: translated from the Japanese only, the
 * same digits per key, ASCII punctuation plus — – ×, no full-width forms).
 *
 * metaTitle / metaDescription are layout.tsx's metadata (the auth routes have
 * none of their own); the Japanese stays exported there for crawlers, and the
 * client swaps in the English while an English visitor is on these screens.
 *
 * The password checklist keeps the platform's canonical Japanese labels
 * (src/app/dxa/dxa-password.ts DEFAULT_PASSWORD_LABELS) word for word.
 */

const ja = {
  metaTitle: "UrbanOracle - 都市データ可視化ダッシュボード",
  metaDescription: "東京23区の地価・人口統計・災害リスク・交通などのオープンデータを可視化するWebダッシュボード",

  brand: "UrbanOracle",
  brandFooter: "UrbanOracle — DXA Labs",
  build: "BUILD",

  // Editorial panel beside the sign-in and verification forms.
  panelHeadline1: "都市の資産価値を、",
  panelHeadline2: "上振れと下振れの両面から。",
  panelBody: "東京23区の地価・人口・交通と、災害リスクを同一の意思決定面で読み解くための計器です。",

  // /login
  eyebrowAccess: "ACCESS",
  headingSignIn: "サインイン",
  headingSignUp: "アカウント作成",
  googleSignIn: "Google でサインイン",
  googleSignUp: "Google で登録",
  or: "または",
  emailLabel: "メールアドレス",
  passwordLabel: "パスワード",
  passwordRules: "パスワード要件",
  passwordLength: "8文字以上",
  passwordLetter: "英字を1文字以上",
  passwordDigit: "数字を1文字以上",
  submitSignIn: "サインイン",
  submitSignUp: "アカウントを作成",
  toggleToSignUp: "アカウントをお持ちでない方",
  toggleToSignIn: "既にアカウントをお持ちの方",
  forgotLink: "パスワードをお忘れの方",
  accountNote: "一つのアカウントで DXA Labs の全プロダクトにアクセスできます。",

  // Error messages (src/lib/auth-errors.ts codes)
  errorTooManyRequests: "試行回数が上限に達しました。しばらく時間をおいて再度お試しください",
  errorInvalidEmail: "メールアドレスの形式が正しくありません",
  errorEmailAlreadyInUse: "他の DXA Labs プロダクトで登録済みのメールアドレスです。サインインしてください",
  errorInvalidCredential: "メールアドレスまたはパスワードが正しくありません",
  errorUserDisabled: "このアカウントは現在ご利用いただけません",
  errorWeakPassword: "パスワードが要件を満たしていません",
  errorPopupClosed: "サインインがキャンセルされました",
  errorPopupBlocked: "ポップアップがブロックされました。ブラウザの設定をご確認ください",
  errorNetwork: "ネットワークに接続できませんでした。接続をご確認のうえ再度お試しください",
  errorUnknown: "処理を完了できませんでした。時間をおいて再度お試しください",

  // /forgot-password
  resetEyebrow: "RESET",
  resetTitle: "パスワードの再設定",
  resetIntro: "ご登録のメールアドレスに再設定用のリンクをお送りします。",
  resetSubmit: "再設定リンクを送信",
  resetSentTitle: "確認メールを送信しました",
  resetSentBody:
    "入力されたメールアドレスが登録されている場合、パスワード再設定用のリンクをお送りしました。 数分経っても届かない場合は、迷惑メールフォルダをご確認ください。",
  backToSignIn: "サインインに戻る",

  // /pending
  pendingHeadline1: "あと一歩で、",
  pendingHeadline2: "計器が開きます。",
  pendingBody:
    "確認できたメールアドレスだけを受け入れています。審査はありません—— リンクを開いた時点で、すべての機能がそのまま使えます。",
  verifyEyebrow: "VERIFICATION",
  verifyTitle: "メールアドレスの確認",
  verifySent: "確認メールをお送りしました。メール内のリンクを開くと認証が完了します。",
  verifyChecking: "確認しています…",
  verifyCheck: "認証を確認",
  verifyStill: "まだ認証を確認できません。メール内のリンクを開いてから、もう一度お試しください。",
  verifyNoMail: "メールが届かない場合",
  verifyResent: "確認メールを再送しました",
  verifyResend: "確認メールを再送",
  verifySpam: "迷惑メールフォルダもご確認ください。送信元は noreply@send.dxalabs.com です。",
  verifySwitch: "別のアカウントでサインインする",
  aboutLink: "UrbanOracle について",
} satisfies Record<string, string>;

const en = {
  metaTitle: "UrbanOracle - Urban data visualization dashboard",
  metaDescription:
    "A web dashboard that visualizes open data on land prices, population statistics, disaster risk, transport and more for Tokyo's 23 wards",

  brand: "UrbanOracle",
  brandFooter: "UrbanOracle — DXA Labs",
  build: "BUILD",

  panelHeadline1: "A city's asset value,",
  panelHeadline2: "from both the upside and the downside.",
  panelBody:
    "An instrument for reading land prices, population and transport across Tokyo's 23 wards together with disaster risk, on the same decision surface.",

  eyebrowAccess: "ACCESS",
  headingSignIn: "Sign in",
  headingSignUp: "Create an account",
  googleSignIn: "Sign in with Google",
  googleSignUp: "Sign up with Google",
  or: "or",
  emailLabel: "Email address",
  passwordLabel: "Password",
  passwordRules: "Password requirements",
  passwordLength: "At least 8 characters",
  passwordLetter: "At least 1 letter",
  passwordDigit: "At least 1 number",
  submitSignIn: "Sign in",
  submitSignUp: "Create account",
  toggleToSignUp: "Don't have an account?",
  toggleToSignIn: "Already have an account?",
  forgotLink: "Forgot your password?",
  accountNote: "One account gives you access to every DXA Labs product.",

  errorTooManyRequests: "Too many attempts. Please wait a while and try again",
  errorInvalidEmail: "The email address is not in a valid format",
  errorEmailAlreadyInUse: "This email address is already registered with another DXA Labs product. Please sign in",
  errorInvalidCredential: "The email address or password is incorrect",
  errorUserDisabled: "This account cannot be used at present",
  errorWeakPassword: "The password does not meet the requirements",
  errorPopupClosed: "Sign-in was cancelled",
  errorPopupBlocked: "The pop-up was blocked. Please check your browser settings",
  errorNetwork: "Could not connect to the network. Please check your connection and try again",
  errorUnknown: "The request could not be completed. Please wait a while and try again",

  resetEyebrow: "RESET",
  resetTitle: "Reset your password",
  resetIntro: "We will send a reset link to your registered email address.",
  resetSubmit: "Send reset link",
  resetSentTitle: "Confirmation email sent",
  resetSentBody:
    "If the email address you entered is registered, we have sent a link to reset your password. If it does not arrive within a few minutes, please check your spam folder.",
  backToSignIn: "Back to sign in",

  pendingHeadline1: "One more step,",
  pendingHeadline2: "and the instrument opens.",
  pendingBody:
    "Only confirmed email addresses are accepted. There is no review — the moment you open the link, every feature is available as it is.",
  verifyEyebrow: "VERIFICATION",
  verifyTitle: "Confirm your email address",
  verifySent: "We have sent you a confirmation email. Open the link in it to complete verification.",
  verifyChecking: "Checking...",
  verifyCheck: "Check verification",
  verifyStill: "Verification could not be confirmed yet. Open the link in the email, then try again.",
  verifyNoMail: "If the email does not arrive",
  verifyResent: "Confirmation email resent",
  verifyResend: "Resend confirmation email",
  verifySpam: "Please also check your spam folder. The sender is noreply@send.dxalabs.com.",
  verifySwitch: "Sign in with a different account",
  aboutLink: "About UrbanOracle",
} satisfies Record<keyof typeof ja, string>;

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** Compile-time: ja and en carry exactly the same keys. */
export const AUTH_KEYS_MATCH: Equal<keyof typeof ja, keyof typeof en> = true;

export type AuthKey = keyof typeof ja;
export type AuthCopy = Record<AuthKey, string>;

export const AUTH_COPY: Record<Lang, AuthCopy> = { ja, en };

/** <title> and description for the auth routes, per language (LanguageProvider `meta`). */
export const AUTH_META: Record<Lang, { title: string; description: string }> = {
  ja: { title: ja.metaTitle, description: ja.metaDescription },
  en: { title: en.metaTitle, description: en.metaDescription },
};

/** Labels for the vendored checkPassword(password, labels) — display only. */
export const PASSWORD_LABELS: Record<Lang, { length: string; letter: string; digit: string }> = {
  ja: { length: ja.passwordLength, letter: ja.passwordLetter, digit: ja.passwordDigit },
  en: { length: en.passwordLength, letter: en.passwordLetter, digit: en.passwordDigit },
};

const ERROR_KEYS: Record<AuthErrorCode, AuthKey> = {
  "too-many-requests": "errorTooManyRequests",
  "invalid-email": "errorInvalidEmail",
  "email-already-in-use": "errorEmailAlreadyInUse",
  "invalid-credential": "errorInvalidCredential",
  "user-disabled": "errorUserDisabled",
  "weak-password": "errorWeakPassword",
  "popup-closed-by-user": "errorPopupClosed",
  "popup-blocked": "errorPopupBlocked",
  "network-request-failed": "errorNetwork",
  unknown: "errorUnknown",
};

/** The message for an auth error code in `lang`. */
export function authErrorText(code: AuthErrorCode, lang: Lang): string {
  return AUTH_COPY[lang][ERROR_KEYS[code]];
}
