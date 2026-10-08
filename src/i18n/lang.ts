/**
 * The visitor's language — the contract the landing page and the auth screens
 * share. One origin serves both, so one localStorage key carries the choice
 * from / to /login and back.
 *
 * Resolution (resolveLang): a valid ?lang=ja|en wins, then a valid stored
 * value, else Japanese. It is pure — the caller reads the location and the
 * storage and passes them in — so it can be tested without a browser and
 * called during render.
 *
 * Storage may throw: private windows, blocked site data and some embedded
 * browsers throw on any access to window.localStorage. readStoredLang then
 * reports nothing and writeStoredLang stores nothing; the page still renders
 * and toggles, it just does not remember.
 */

export type Lang = "ja" | "en";

export const LANGS: readonly Lang[] = ["ja", "en"];
export const DEFAULT_LANG: Lang = "ja";
export const STORAGE_KEY = "urbanoracle.lang";
export const URL_PARAM = "lang";

export function isLang(value: unknown): value is Lang {
  return value === "ja" || value === "en";
}

export function resolveLang(search: string, stored: string | null): Lang {
  const forced = new URLSearchParams(search).get(URL_PARAM);
  if (isLang(forced)) return forced;
  if (isLang(stored)) return stored;
  return DEFAULT_LANG;
}

export function readStoredLang(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeStoredLang(lang: Lang): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Storage unavailable: the choice lives for this page only.
  }
}
