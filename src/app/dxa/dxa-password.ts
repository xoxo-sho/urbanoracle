/* dxa-ui v0.3.0 — DO NOT EDIT. Synced from dxa-ui/tokens. */

/**
 * パスワード強度 — プラットフォーム統一ルール（8文字+ / 英字1+ / 数字1+）の
 * 単一定義。v0.3.0 で dxa-ui に収容（それまでの経緯が収容の理由そのもの）:
 *
 * 8サーフェスが「UrbanOracle の参照実装の移植」を各自で手写しした結果、
 * 誰も気づかないまま **2つの述語ファミリー** に分岐していた（RECON-C item B、
 * 2026-08-20 実測）。6モジュールは `c.toLowerCase()` + 文字列範囲比較で、
 * Unicode の toLowerCase が ASCII に落ちる文字 — `İ`(U+0130) や
 * ケルビン記号 `K`(U+212A) — を「英字」として受理する。canonical は
 * codepoint 範囲比較（arcline / disastershield が保持していた形）。
 * 手写しが分岐を生んだのだから、修正は共有 + drift 検出（check-dxa-drift が
 * このファイルのバイトを毎 CI で検証する）。
 *
 * **この「英字1+」ルールの enforcement はプラットフォーム全体でここだけ。**
 * テナント dxalabs-platform の床は minLength=8 + requireNumeric のみ
 * （2026-08-20 コンソール実読: Require enforcement / min 8 / max 4096 /
 * 数字必須 ON / 英字・大文字・小文字・記号・強制再設定 すべて OFF）。この
 * モジュールを出荷しなければ、そのルールは何も言わずに消える。仕様は
 * dxa-password.vectors.ts — テストではなく定義（そちらの冒頭を参照）。
 *
 * 意図的に regex を使わない。各ルールが独立した述語なので、UI は「どれが
 * 未達か」をそのまま点灯表示でき、ルール変更も述語1つの差し替えで済む。
 *
 * codepoint 比較である理由（いずれも実測済み）:
 *   - `[...pw]` であって `pw.split("")` ではない。サロゲートペアを1文字と
 *     数える。"😀😀😀ab1" は codepoint で 6・UTF-16 単位で 9 — 後者だと
 *     8文字未満を「8文字以上」と表示して通す。
 *   - `/[a-z]/iu` ではない。`iu` の case folding は `ſ`(U+017F) を英字と
 *     判定する。そして `c.toLowerCase()` + 文字列範囲も `İ`/`K` を通す
 *     （上記の分岐実測）。数値の codepoint 範囲だけがどちらの穴も持たない。
 *   - `/\d/` ではない。JS の `\d` は常に [0-9] だが、意図を数値範囲で
 *     明示しておけばコードから読み取れる（全角 `１` やアラビア数字 `٣` を
 *     数字に数えないのは要件）。
 *
 * 判定がテナントとずれると「画面上は要件を満たしているのに拒否される」と
 * いう、ユーザーに原因の見えない壊れ方をする。ラベルはプラットフォーム
 * 正準の日本語が既定で、ロケールを持つサーフェスは `labels` で差し替える
 * （判定には一切影響しない）。disastershield のように別 API（message を
 * 返す validator）を持つサーフェスは、この述語の上に薄いローカル adapter を
 * 置く — API の違いは分岐ではない。述語の無検査コピー8つが分岐だった。
 */

export interface PasswordCheck {
  id: "length" | "letter" | "digit";
  label: string;
  passed: boolean;
}

export interface PasswordLabels {
  length: string;
  letter: string;
  digit: string;
}

export const MIN_LENGTH = 8;

/** プラットフォーム正準ラベル（日本語）。ja ロケールでは一字一句このまま。 */
export const DEFAULT_PASSWORD_LABELS: PasswordLabels = {
  length: `${MIN_LENGTH}文字以上`,
  letter: "英字を1文字以上",
  digit: "数字を1文字以上",
};

/** ASCII A–Z / a–z のみ。日本語・全角・İ/K/ſ は英字ではない。 */
export function isAsciiLetter(cp: number): boolean {
  return (cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a);
}

/** ASCII 0–9 のみ。全角数字・アラビア数字は数字ではない。 */
export function isAsciiDigit(cp: number): boolean {
  return cp >= 0x30 && cp <= 0x39;
}

/**
 * ルールごとの判定。判定ロジックはロケール非依存 — `labels` は表示文言だけを
 * 差し替える（`passed` には一切影響しない）。
 */
export function checkPassword(
  password: string,
  labels: PasswordLabels = DEFAULT_PASSWORD_LABELS,
): PasswordCheck[] {
  const codepoints = [...password].map((ch) => ch.codePointAt(0)!);
  return [
    { id: "length", label: labels.length, passed: codepoints.length >= MIN_LENGTH },
    { id: "letter", label: labels.letter, passed: codepoints.some(isAsciiLetter) },
    { id: "digit", label: labels.digit, passed: codepoints.some(isAsciiDigit) },
  ];
}

export function isPasswordAcceptable(password: string): boolean {
  return checkPassword(password).every((c) => c.passed);
}
