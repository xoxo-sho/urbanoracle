import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRef } from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { DEFAULT_PASSWORD_LABELS } from "@/app/dxa/dxa-password";
import AuthPanel from "@/components/auth/AuthPanel";
import { AUTH_COPY, PASSWORD_LABELS, type AuthKey } from "@/i18n/auth";
import { LanguageProvider } from "@/i18n/lang-context";
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
 *     (the RECON's 56) is in the dictionary — except the 8 the split rebuild
 *     removed on purpose (REMOVED_IN_SPLIT), which are gone from the
 *     dictionary and the sources alike — and none is left in those files;
 *   - the panel (L6, static half): no numeral in its strings or its render,
 *     in either language, no 再現 / "recreat", no svg text.
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
/** Landcast's numeral class: ASCII and full-width digits, kanji numerals. */
const NUMERAL = /[0-9０-９〇一二三四五六七八九十百千万億兆]/u;
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

/**
 * Removed by the split rebuild (S3), each for a stated reason:
 *   - the /login editorial column, replaced by the abstract panel (3);
 *   - the 「アカウント作成」 h2, replaced by the wordmark and subtitle (1);
 *   - 「パスワードをお忘れの方」, now the family's 「パスワードをお忘れですか？」 (1);
 *   - the /pending editorial column, replaced by the same panel (3).
 */
const REMOVED_IN_SPLIT = [
  "都市の資産価値を、",
  "上振れと下振れの両面から。",
  "東京23区の地価・人口・交通と、災害リスクを同一の意思決定面で読み解くための計器です。",
  "アカウント作成",
  "パスワードをお忘れの方",
  "あと一歩で、",
  "計器が開きます。",
  "確認できたメールアドレスだけを受け入れています。審査はありません—— リンクを開いた時点で、すべての機能がそのまま使えます。",
];
/** Whole labels the split rebuild retired that are not RECON literals on their own. */
const RETIRED_LABELS = ["Google で登録", "ACCESS", "UrbanOracle — DXA Labs"];

const PANEL_KEYS: AuthKey[] = [
  "panelLabel",
  "slideATitle",
  "slideACaption",
  "slideBTitle",
  "slideBCaption",
  "slideCTitle",
  "slideCCaption",
];

const SCREEN_FILES = [
  "src/app/login/page.tsx",
  "src/app/pending/page.tsx",
  "src/app/forgot-password/page.tsx",
  "src/lib/auth-errors.ts",
  "src/components/auth/AuthShell.tsx",
  "src/components/auth/AuthPanel.tsx",
];

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

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

  it("covers every Japanese literal the RECON counted (56), less the 8 the split removed", () => {
    expect(RECON_LITERALS).toHaveLength(56);
    expect(REMOVED_IN_SPLIT.every((r) => RECON_LITERALS.includes(r))).toBe(true);
    const values = Object.values(ja);
    const kept = RECON_LITERALS.filter((literal) => !REMOVED_IN_SPLIT.includes(literal));
    expect(kept).toHaveLength(48);
    const missing = kept.filter((literal) => !values.some((v) => v.includes(literal)));
    expect(missing).toEqual([]);
  });

  it("the removed literals and retired labels are gone from the dictionary and the sources", () => {
    const gone = [...REMOVED_IN_SPLIT, ...RETIRED_LABELS];
    const values = [...Object.values(ja), ...Object.values(en)];
    expect(gone.filter((g) => values.some((v) => v.includes(g)))).toEqual([]);
    const sources = SCREEN_FILES.map((file) => stripComments(readFileSync(path.join(process.cwd(), file), "utf8")));
    expect(gone.filter((g) => sources.some((s) => s.includes(g)))).toEqual([]);
  });

  it("leaves no Japanese literal in the screens, the shell, the panel or auth-errors.ts (comments aside)", () => {
    const offenders = SCREEN_FILES.flatMap((file) => {
      const source = stripComments(readFileSync(path.join(process.cwd(), file), "utf8"));
      return source
        .split("\n")
        .map((line, i) => ({ line: i + 1, text: line.trim() }))
        .filter((l) => JAPANESE.test(l.text))
        .map((l) => `${file}:${l.line}: ${l.text}`);
    });
    expect(offenders).toEqual([]);
  });
});

describe("the panel's strings and render (L6, static)", () => {
  it("no numeral, no 再現 / recreat in any panel string, in either language", () => {
    for (const lang of ["ja", "en"] as const) {
      const strings = PANEL_KEYS.map((k) => AUTH_COPY[lang][k]);
      expect(strings.filter((v) => NUMERAL.test(v)), lang).toEqual([]);
      expect(strings.filter((v) => v.includes("再現") || v.toLowerCase().includes("recreat")), lang).toEqual([]);
    }
  });

  it("the label says what the panel is, in both languages", () => {
    expect(ja.panelLabel).toBe("出力の形を示す模式図 — 実画面ではありません。数値は含みません。");
    expect(en.panelLabel).toBe("Schematic of the output's shape — not a real screen. No figures included.");
  });

  for (const lang of ["ja", "en"] as const) {
    it(`renders (${lang}) with no numeral in its text or labels, no svg text, the label on all three slides`, async () => {
      window.localStorage.setItem("urbanoracle.lang", lang);
      const { container } = render(
        <LanguageProvider>
          <AuthPanel focusScope={createRef<HTMLElement>()} />
        </LanguageProvider>
      );
      await waitFor(() => expect(document.documentElement.lang).toBe(lang));
      const panel = container.querySelector("[data-auth-panel]")!;
      const attrs = [...panel.querySelectorAll("*")].flatMap((el) =>
        ["aria-label", "title", "alt", "aria-description"].map((a) => el.getAttribute(a) ?? "")
      );
      const text = [panel.textContent ?? "", ...attrs].join("\n");
      expect(text.match(new RegExp(NUMERAL.source, "gu")) ?? []).toEqual([]);
      expect(text).not.toContain("再現");
      expect(text.toLowerCase()).not.toContain("recreat");
      expect(panel.querySelectorAll("svg text, svg title, svg desc")).toHaveLength(0);
      const labels = [...panel.querySelectorAll("[data-auth-slide]")].map((s) => s.querySelector("[data-auth-label]")?.textContent);
      expect(labels).toEqual([AUTH_COPY[lang].panelLabel, AUTH_COPY[lang].panelLabel, AUTH_COPY[lang].panelLabel]);
    });
  }
});
