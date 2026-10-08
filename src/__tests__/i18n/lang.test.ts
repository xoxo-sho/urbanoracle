import { afterEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEY, readStoredLang, resolveLang, writeStoredLang } from "@/i18n/lang";

/**
 * The language contract the landing page and the login rebuild share.
 *
 * resolveLang is pure: a valid ?lang= wins, then a valid stored value, else
 * Japanese. Storage access lives only in readStoredLang / writeStoredLang,
 * and both survive a localStorage that throws (private windows, blocked site
 * data) by reporting nothing and storing nothing.
 */

describe("resolveLang", () => {
  const cases: [search: string, stored: string | null, expected: "ja" | "en"][] = [
    ["?lang=en", null, "en"],
    ["?lang=ja", "en", "ja"],
    ["", "en", "en"],
    ["", "xx", "ja"],
    ["?lang=fr", null, "ja"],
    ["", null, "ja"],
  ];

  it.each(cases)("resolveLang(%j, %j) → %j", (search, stored, expected) => {
    expect(resolveLang(search, stored)).toBe(expected);
  });

  it("is pure: it reads neither storage nor the location", () => {
    window.localStorage.setItem(STORAGE_KEY, "en");
    window.history.replaceState(null, "", "/?lang=en");
    try {
      expect(resolveLang("", null)).toBe("ja");
    } finally {
      window.localStorage.removeItem(STORAGE_KEY);
      window.history.replaceState(null, "", "/");
    }
  });
});

describe("storage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.removeItem(STORAGE_KEY);
  });

  it('uses the key "urbanoracle.lang"', () => {
    expect(STORAGE_KEY).toBe("urbanoracle.lang");
  });

  it("round-trips a written language", () => {
    writeStoredLang("en");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("en");
    expect(readStoredLang()).toBe("en");
  });

  it("returns null and stores nothing when localStorage itself throws on access", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("storage disabled", "SecurityError");
    });
    expect(readStoredLang()).toBeNull();
    expect(() => writeStoredLang("en")).not.toThrow();
    vi.restoreAllMocks();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("returns null and is a no-op when getItem / setItem throw", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(readStoredLang()).toBeNull();
    expect(() => writeStoredLang("ja")).not.toThrow();
  });
});
