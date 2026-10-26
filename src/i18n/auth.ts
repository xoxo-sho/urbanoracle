import type { Lang } from "@/i18n/lang";
import type { AuthErrorCode } from "@/lib/auth-errors";

/**
 * Every string the auth screens render — /login (both modes), /pending,
 * /forgot-password and, since Stage 2, /auth/action — plus auth-errors'
 * messages and the password checklist, in Japanese and English.
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
 * /auth/action carries its own title (ACTION_META); /pending keeps the site's,
 * because e2e/lang-title.spec.ts's title-write budget is already met there
 * (verifyTitle stays in the dictionary as Parti's entry, unused on screen).
 *
 * The password checklist keeps the platform's canonical Japanese labels
 * (src/app/dxa/dxa-password.ts DEFAULT_PASSWORD_LABELS).
 *
 * STAGE 2 (2026-10-25). The verify* and action* entries are Parti's verify.*
 * and action.* (frontend/lib/auth-copy.ts @origin/main), verbatim, with the
 * spec's substitutions only: "Parti" → "UrbanOracle", the landing word
 * 「プロジェクト一覧」 → 「ダッシュボード」 / "your projects" → "the dashboard",
 * and the English "…" → "..." (this dictionary's ASCII rule). The two
 * verify*Failed lines are this product's own: Parti shows them as bilingual
 * literals in the screen, which this dictionary's tests forbid.
 *
 * A1 (review amendment): where Parti's entries say ログイン / ログアウト /
 * "Log out", this product says サインイン / サインアウト / "Sign in" / "Sign out"
 * — the terms /login (submitSignIn) and /app (SignOutButton) already use.
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

  // /pending (Stage 2): the waiting screen and the confirmed state
  verifyTitle: "メールアドレスの確認 — UrbanOracle",
  verifyPill: "確認を待っています",
  verifyHeading: "メールを確認してください",
  verifyLead: "確認用のリンクを次のアドレスに送りました。",
  verifyYourAddress: "ご登録のメールアドレス",
  verifyChangeAddress: "アドレスが違う場合は登録し直す",
  verifyProviderGmail: "Gmail を開く",
  verifyProviderOutlook: "Outlook を開く",
  verifyProviderYahoo: "Yahoo!メールを開く",
  verifyProviderIcloud: "iCloud メールを開く",
  verifyStep1: "メールの「メールアドレスを確認する」を押します。",
  verifyStep2: "この画面は自動で次へ進みます。スマホでメールを開いても大丈夫です。",
  verifyResend: "確認メールを再送",
  verifyCountdown: "{seconds} 秒後に再送できます",
  verifyResent: "確認メールを再送しました",
  verifyDailyLimit: "本日の再送上限に達しました。時間をおいてお試しください。",
  verifySendFailed: "確認メールを送信できませんでした。時間をおいてもう一度お試しください。",
  verifyDetails: "メールが届かない場合",
  verifyHintSpam: "迷惑メールフォルダを確認してください。送信元は noreply@send.dxalabs.com です。",
  verifyHintCarrier: "携帯会社のメール（ドコモ・au・ソフトバンク）をお使いの場合は、send.dxalabs.com からの受信を許可してください。",
  verifyHintCompany: "会社のメールでは、セキュリティ確認のため届くまで数分かかることがあります。",
  verifyLogout: "サインアウト",
  verifyDetectedPill: "確認できました",
  verifyDetectedHeading: "メールアドレスを確認しました",
  verifyDetectedLead: "{email} の確認が完了しました。",
  verifyPreparing: "ダッシュボードを開いています",
  verifyFallback: "自動で移動しない場合は",
  verifyFallbackLink: "ダッシュボードを開く",
  verifyFinishFailed: "確認に失敗しました — もう一度お試しください",
  verifySignOutFailed: "サインアウトできませんでした — まだサインインしたままです",
  aboutLink: "UrbanOracle について",

  // /auth/action (Stage 2): the link in the verification mail, per state
  actionTitle: "メールアドレスの確認 — UrbanOracle",
  actionVerifying: "確認しています…",
  actionSameHeading: "メールアドレスを確認しました",
  actionSameLead: "まもなくダッシュボードへ移動します。",
  actionOpenNow: "今すぐ開く",
  actionOtherHeading: "確認が完了しました",
  actionOtherLead: "UrbanOracle を開いている元の画面は、自動で次へ進みます。この画面は閉じてかまいません。",
  actionCaptionThisDevice: "この端末",
  actionCaptionOriginal: "元の画面",
  actionDiagramLabel: "この端末で確認すると、元の画面が進みます",
  actionContinueHere: "この端末で続ける",
  actionContinueHint: "サインイン画面が開きます",
  actionExpiredHeading: "このリンクは使えなくなっています",
  actionExpiredLead: "有効期限が切れたか、すでに使われたリンクです。確認が済んでいれば、そのままサインインできます。",
  actionExpiredButton: "サインインして確認する",
  actionExpiredNote: "サインイン後、まだ確認が済んでいなければ、新しいリンクをその場でお送りします。",
  actionExpiredSendNew: "新しいリンクを送る",
  actionInvalidHeading: "このリンクは開けません",
  actionInvalidLead: "リンクが途中で切れている可能性があります。メールのボタンから開き直すか、サインインして新しいリンクを受け取ってください。",
  actionInvalidButton: "サインイン",
  actionErrorHeading: "確認できませんでした",
  actionErrorLead: "通信に失敗しました。もう一度お試しください。",
  actionErrorButton: "もう一度試す",
  actionHelp: "お困りの場合は {address}",

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

  verifyTitle: "Verify your email — UrbanOracle",
  verifyPill: "Waiting for confirmation",
  verifyHeading: "Check your email",
  verifyLead: "We sent a confirmation link to:",
  verifyYourAddress: "your address",
  verifyChangeAddress: "Wrong address? Sign up again",
  verifyProviderGmail: "Open Gmail",
  verifyProviderOutlook: "Open Outlook",
  verifyProviderYahoo: "Open Yahoo! Mail",
  verifyProviderIcloud: "Open iCloud Mail",
  verifyStep1: 'Press "Confirm email address" in the email.',
  verifyStep2: "This screen moves on by itself. Opening the email on your phone works too.",
  verifyResend: "Resend confirmation email",
  verifyCountdown: "You can resend in {seconds}s",
  verifyResent: "Confirmation email sent again",
  verifyDailyLimit: "You've reached today's resend limit. Please try again later.",
  verifySendFailed: "We couldn't send the confirmation email. Please try again in a little while.",
  verifyDetails: "Didn't get the email?",
  verifyHintSpam: "Check your spam folder. It comes from noreply@send.dxalabs.com.",
  verifyHintCarrier: "If you use a Japanese mobile carrier address (docomo, au, SoftBank), allow mail from send.dxalabs.com.",
  verifyHintCompany: "Company mail systems may take a few minutes to deliver it while they scan it.",
  verifyLogout: "Sign out",
  verifyDetectedPill: "Confirmed",
  verifyDetectedHeading: "Email address confirmed",
  verifyDetectedLead: "{email} is confirmed.",
  verifyPreparing: "Opening the dashboard",
  verifyFallback: "Not moving?",
  verifyFallbackLink: "Open the dashboard",
  verifyFinishFailed: "Could not confirm verification — please try again",
  verifySignOutFailed: "Sign-out failed — you are still signed in",
  aboutLink: "About UrbanOracle",

  actionTitle: "Confirm your email — UrbanOracle",
  actionVerifying: "Confirming...",
  actionSameHeading: "Email address confirmed",
  actionSameLead: "Taking you to the dashboard...",
  actionOpenNow: "Open now",
  actionOtherHeading: "You're confirmed",
  actionOtherLead: "The UrbanOracle screen you started on moves on by itself. You can close this page.",
  actionCaptionThisDevice: "This device",
  actionCaptionOriginal: "Original screen",
  actionDiagramLabel: "Confirming here moves the original screen on",
  actionContinueHere: "Continue on this device",
  actionContinueHint: "Opens the sign-in page",
  actionExpiredHeading: "This link no longer works",
  actionExpiredLead: "It has expired or has already been used. If your address is already confirmed, you can just sign in.",
  actionExpiredButton: "Sign in to check",
  actionExpiredNote: "After you sign in, we'll send a new link right away if your address isn't confirmed yet.",
  actionExpiredSendNew: "Send a new link",
  actionInvalidHeading: "This link can't be opened",
  actionInvalidLead: "The link may have been cut off. Open it again from the button in the email, or sign in to get a new one.",
  actionInvalidButton: "Sign in",
  actionErrorHeading: "We couldn't confirm",
  actionErrorLead: "The connection failed. Please try again.",
  actionErrorButton: "Try again",
  actionHelp: "Need help? {address}",

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

/** <title> and description for /login and /forgot-password, per language (LanguageProvider `meta`). */
export const AUTH_META: Record<Lang, { title: string; description: string }> = {
  ja: { title: ja.metaTitle, description: ja.metaDescription },
  en: { title: en.metaTitle, description: en.metaDescription },
};

/** /auth/action's own title (Parti's action.title). */
export const ACTION_META: Record<Lang, { title: string; description: string }> = {
  ja: { title: ja.actionTitle, description: ja.metaDescription },
  en: { title: en.actionTitle, description: en.metaDescription },
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
