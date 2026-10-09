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
  subtitle: "都市データ可視化ダッシュボード",
  build: "BUILD",

  // /login
  googleSignIn: "Google でサインイン",
  or: "または",
  emailLabel: "メールアドレス",
  emailPlaceholder: "user@example.com",
  passwordLabel: "パスワード",
  passwordPlaceholder: "8文字以上",
  passwordRules: "パスワード要件",
  passwordLength: "8文字以上",
  passwordLetter: "英字を1文字以上",
  passwordDigit: "数字を1文字以上",
  submitSignIn: "サインイン",
  submitSignUp: "アカウントを作成",
  toggleToSignUp: "アカウントをお持ちでない方",
  toggleToSignIn: "既にアカウントをお持ちの方",
  forgotLink: "パスワードをお忘れですか？",
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

  // The decorative panel beside /login and /pending (AuthPanel). No numerals.
  panelLabel: "出力の形を示す模式図 — 実画面ではありません。数値は含みません。",
  slideATitle: "区ごとの面",
  slideACaption: "区の輪郭を、ひとつの指標で塗り分ける。",
  slideBTitle: "年齢構成",
  slideBCaption: "区ごとの年齢構成を、年齢層の帯で並べる。",
  slideCTitle: "重ね合わせ",
  slideCCaption: "ハザードの層と駅の規模を、同じ面に重ねる。",
} satisfies Record<string, string>;

const en = {
  metaTitle: "UrbanOracle - Urban data visualization dashboard",
  metaDescription:
    "A web dashboard that visualizes open data on land prices, population statistics, disaster risk, transport and more for Tokyo's 23 wards",

  brand: "UrbanOracle",
  subtitle: "Urban data visualization dashboard",
  build: "BUILD",

  googleSignIn: "Sign in with Google",
  or: "or",
  emailLabel: "Email address",
  emailPlaceholder: "user@example.com",
  passwordLabel: "Password",
  passwordPlaceholder: "At least 8 characters",
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

  panelLabel: "Schematic of the output's shape — not a real screen. No figures included.",
  slideATitle: "Ward by ward",
  slideACaption: "Shades each ward's outline by a single indicator.",
  slideBTitle: "Age composition",
  slideBCaption: "Lines up each ward's age composition as bands by age group.",
  slideCTitle: "Overlay",
  slideCCaption: "Lays hazard areas and station scale over the same surface.",
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
