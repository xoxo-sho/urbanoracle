import { describe, expect, it } from "vitest";
import { LP_COPY, WARD_NAMES, type LpKey } from "@/i18n/lp";

/**
 * The landing-page dictionary.
 *
 *   - ja and en carry the same keys (also a compile-time assertion in lp.ts);
 *   - a translation never changes a number: for every key, the digit sequence
 *     in ja (full-width digits normalised to ASCII) equals the one in en;
 *   - English carries no Japanese script and no full-width or CJK punctuation.
 *     Its only non-ASCII characters are the em dash, the en dash and the
 *     multiplication sign — the ones the Japanese page already sets in Latin
 *     text ("TOKYO 23 WARDS — LAND VALUE × RISK", "0–100", "Lv.1–5");
 *   - the strings the brief fixes word for word are exactly that.
 */

const ja = LP_COPY.ja;
const en = LP_COPY.en;

function digits(value: string): string {
  return value
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
    .replace(/[^0-9]/g, "");
}

/** Japanese script, CJK punctuation, full-width and half-width forms. */
const NOT_ENGLISH = /[　-〿぀-ヿ㐀-䶿一-鿿＀-￯]/u;
const ALLOWED_NON_ASCII = new Set(["—", "–", "×"]);

const wardEntries = Object.entries(WARD_NAMES);

describe("LP dictionary", () => {
  it("ja and en have identical key sets", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ja).sort());
  });

  it("no value is empty", () => {
    const empty = (Object.keys(ja) as LpKey[]).filter((k) => !ja[k].trim() || !en[k].trim());
    expect(empty).toEqual([]);
  });

  it("every key carries the same digit sequence in ja and en", () => {
    const mismatched = (Object.keys(ja) as LpKey[])
      .filter((k) => digits(ja[k]) !== digits(en[k]))
      .map((k) => `${k}: ja=${digits(ja[k])} en=${digits(en[k])}`);
    expect(mismatched).toEqual([]);
  });

  it("English has no Japanese script and no full-width forms; its non-ASCII set is exactly — – ×", () => {
    const values = [...Object.values(en), ...wardEntries.map(([, w]) => w.en)];
    const japanese = values.filter((v) => NOT_ENGLISH.test(v));
    expect(japanese).toEqual([]);

    const nonAscii = new Set(values.flatMap((v) => [...v].filter((c) => c.charCodeAt(0) > 0x7e)));
    expect([...nonAscii].filter((c) => !ALLOWED_NON_ASCII.has(c))).toEqual([]);
  });

  it("fixed English wording", () => {
    expect(en.heroCta).toBe("Sign in");
    expect(en.headerSignIn).toBe("Sign in");
    expect(en.sampleTag).toBe("SAMPLE");
    expect(en.sampleNotice).toBe("Sample data (provisional) — not real data");
  });
});

describe("ward names", () => {
  it("cover exactly the 23 codes 13101–13123", () => {
    const expected = Array.from({ length: 23 }, (_, i) => String(13101 + i));
    expect(Object.keys(WARD_NAMES).sort()).toEqual(expected);
  });

  it("are romanized ASCII in English and carry no digits", () => {
    const bad = wardEntries.filter(([, w]) => !/^[A-Z][a-z]+$/.test(w.en) || /[0-9]/.test(w.ja));
    expect(bad).toEqual([]);
  });
});
