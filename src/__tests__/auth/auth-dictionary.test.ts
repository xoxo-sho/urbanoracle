import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_PASSWORD_LABELS } from "@/app/dxa/dxa-password";
import { AUTH_COPY, PASSWORD_LABELS, type AuthKey } from "@/i18n/auth";
import { metadata as layoutMetadata } from "@/app/layout";

// layout.tsx calls next/font loaders at module scope; only its metadata is read.
vi.mock("next/font/google", () => {
  const font = () => ({ variable: "", className: "", style: { fontFamily: "" } });
  return { Geist: font, Geist_Mono: font, Noto_Sans_JP: font };
});
vi.mock("next/font/local", () => ({
  default: () => ({ variable: "", className: "", style: { fontFamily: "" } }),
}));

/**
 * The auth screens' dictionary (/login, /pending, /forgot-password).
 *
 *   - ja and en carry the same keys (also a compile-time assertion in auth.ts);
 *   - every key carries the same digits in both languages;
 *   - English has no Japanese script and no full-width forms; its only
 *     non-ASCII characters are — – ×;
 *   - the password checklist keeps the platform's canonical Japanese labels;
 *   - the Japanese title and description equal layout.tsx's metadata;
 *   - every Japanese literal the screens and auth-errors.ts carried
 *     (the RECON's 56) is in the dictionary, and none is left in those files.
 */

const ja = AUTH_COPY.ja;
const en = AUTH_COPY.en;
const keys = Object.keys(ja) as AuthKey[];

function digits(value: string): string {
  return value
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
    .replace(/[^0-9]/g, "");
}

const NOT_ENGLISH = /[　-〿぀-ヿ㐀-䶿一-鿿＀-￯]/u;
const ALLOWED_NON_ASCII = new Set(["—", "–", "×"]);
const JAPANESE = /[぀-ヿ㐀-鿿！-｠]/u;

/** The Japanese literals the RECON counted on these screens and in auth-errors.ts (56). */
const RECON_LITERALS = [
  // src/app/login/page.tsx (19)
  "パスワードが要件を満たしていません",
  "都市の資産価値を、",
  "上振れと下振れの両面から。",
  "東京23区の地価・人口・交通と、災害リスクを同一の意思決定面で読み解くための計器です。",
  "サインイン",
  "アカウント作成",
  "Google で",
  "サインイン",
  "登録",
  "または",
  "メールアドレス",
  "パスワード",
  "パスワード要件",
  "サインイン",
  "アカウントを作成",
  "アカウントをお持ちでない方",
  "既にアカウントをお持ちの方",
  "パスワードをお忘れの方",
  "一つのアカウントで DXA Labs の全プロダクトにアクセスできます。",
  // src/app/forgot-password/page.tsx (8)
  "確認メールを送信しました",
  "入力されたメールアドレスが登録されている場合、パスワード再設定用のリンクをお送りしました。 数分経っても届かない場合は、迷惑メールフォルダをご確認ください。",
  "サインインに戻る",
  "パスワードの再設定",
  "ご登録のメールアドレスに再設定用のリンクをお送りします。",
  "メールアドレス",
  "再設定リンクを送信",
  "サインインに戻る",
  // src/app/pending/page.tsx (15)
  "あと一歩で、",
  "計器が開きます。",
  "確認できたメールアドレスだけを受け入れています。審査はありません—— リンクを開いた時点で、すべての機能がそのまま使えます。",
  "一つのアカウントで DXA Labs の全プロダクトにアクセスできます。",
  "メールアドレスの確認",
  "確認メールをお送りしました。メール内のリンクを開くと認証が完了します。",
  "確認しています…",
  "認証を確認",
  "まだ認証を確認できません。メール内のリンクを開いてから、もう一度お試しください。",
  "メールが届かない場合",
  "確認メールを再送しました",
  "確認メールを再送",
  "迷惑メールフォルダもご確認ください。送信元は noreply@send.dxalabs.com です。",
  "別のアカウントでサインインする",
  "UrbanOracle について",
  // src/lib/auth-errors.ts (11)
  "他の DXA Labs プロダクトで登録済みのメールアドレスです。サインインしてください",
  "試行回数が上限に達しました。しばらく時間をおいて再度お試しください",
  "メールアドレスの形式が正しくありません",
  "メールアドレスまたはパスワードが正しくありません",
  "メールアドレスまたはパスワードが正しくありません",
  "このアカウントは現在ご利用いただけません",
  "パスワードが要件を満たしていません",
  "サインインがキャンセルされました",
  "ポップアップがブロックされました。ブラウザの設定をご確認ください",
  "ネットワークに接続できませんでした。接続をご確認のうえ再度お試しください",
  "処理を完了できませんでした。時間をおいて再度お試しください",
  // src/app/dxa/dxa-password.ts checklist labels (3)
  "8文字以上",
  "英字を1文字以上",
  "数字を1文字以上",
];

describe("auth dictionary", () => {
  it("ja and en have identical key sets", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ja).sort());
  });

  it("no value is empty", () => {
    expect(keys.filter((k) => !ja[k].trim() || !en[k].trim())).toEqual([]);
  });

  it("every key carries the same digit sequence in ja and en", () => {
    const mismatched = keys
      .filter((k) => digits(ja[k]) !== digits(en[k]))
      .map((k) => `${k}: ja=${digits(ja[k])} en=${digits(en[k])}`);
    expect(mismatched).toEqual([]);
  });

  it("English has no Japanese script and no full-width forms; its non-ASCII set is within — – ×", () => {
    const values = Object.values(en);
    expect(values.filter((v) => NOT_ENGLISH.test(v))).toEqual([]);
    const nonAscii = new Set(values.flatMap((v) => [...v].filter((c) => c.charCodeAt(0) > 0x7e)));
    expect([...nonAscii].filter((c) => !ALLOWED_NON_ASCII.has(c))).toEqual([]);
  });

  it("password checklist: the platform's canonical Japanese labels, and their English", () => {
    expect(PASSWORD_LABELS.ja).toEqual({ length: "8文字以上", letter: "英字を1文字以上", digit: "数字を1文字以上" });
    expect(PASSWORD_LABELS.ja).toEqual(DEFAULT_PASSWORD_LABELS);
    expect(PASSWORD_LABELS.en).toEqual({
      length: "At least 8 characters",
      letter: "At least 1 letter",
      digit: "At least 1 number",
    });
  });

  it("the Japanese title and description are layout.tsx's metadata", () => {
    expect(ja.metaTitle).toBe(layoutMetadata.title);
    expect(ja.metaDescription).toBe(layoutMetadata.description);
  });

  it("covers every Japanese literal the RECON counted (56)", () => {
    expect(RECON_LITERALS).toHaveLength(56);
    const values = Object.values(ja);
    const missing = RECON_LITERALS.filter((literal) => !values.some((v) => v.includes(literal)));
    expect(missing).toEqual([]);
  });

  it("leaves no Japanese literal in the screens or auth-errors.ts (comments aside)", () => {
    const files = [
      "src/app/login/page.tsx",
      "src/app/pending/page.tsx",
      "src/app/forgot-password/page.tsx",
      "src/lib/auth-errors.ts",
    ];
    const offenders = files.flatMap((file) => {
      const source = readFileSync(path.join(process.cwd(), file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      return source
        .split("\n")
        .map((line, i) => ({ line: i + 1, text: line.trim() }))
        .filter((l) => JAPANESE.test(l.text))
        .map((l) => `${file}:${l.line}: ${l.text}`);
    });
    expect(offenders).toEqual([]);
  });
});
