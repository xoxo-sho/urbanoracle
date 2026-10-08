"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  DEFAULT_LANG,
  URL_PARAM,
  isLang,
  readStoredLang,
  resolveLang,
  writeStoredLang,
  type Lang,
} from "@/i18n/lang";
import { LP_COPY, type Copy } from "@/i18n/lp";

/**
 * The landing page's language, chosen in the browser and swapped without a
 * reload (ported from landcast lp/src/i18n/lang-context.tsx).
 *
 * WHY THE FIRST RENDER IS ALWAYS JAPANESE
 * ---------------------------------------
 * The site is a static export: the HTML is prerendered in Japanese — what
 * crawlers index, what scripts/verify-bundle.sh checks, and what the jsdom
 * tests render. The client's first render must match it, so every mount starts
 * at DEFAULT_LANG and the stored / URL choice is applied after mount. An
 * English reader sees the Japanese for the moment that takes; text reflows,
 * nothing moves.
 *
 * The state lives in a small per-mount store read through
 * useSyncExternalStore (the ThemeToggle pattern) rather than in useState set
 * from an effect, which this repo's lint (react-hooks/set-state-in-effect)
 * rejects. The server snapshot is DEFAULT_LANG, so hydration matches.
 *
 * RESOLUTION (lang.ts resolveLang): ?lang=ja|en wins and is remembered, then
 * localStorage["urbanoracle.lang"], then Japanese. Toggling while ?lang= is on
 * the URL rewrites it with replaceState, or a reload would snap back.
 *
 * <html lang>, <title> and the meta description follow the language; on
 * unmount <html lang> returns to Japanese, because every other route is.
 */

type LangStore = {
  get: () => Lang;
  isReady: () => boolean;
  subscribe: (listener: () => void) => () => void;
  resolve: () => void;
  set: (next: Lang) => void;
};

function readSearch(): string {
  try {
    return window.location.search;
  } catch {
    return "";
  }
}

function syncUrlLang(lang: Lang): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(URL_PARAM)) return;
    url.searchParams.set(URL_PARAM, lang);
    window.history.replaceState(window.history.state, "", url);
  } catch {
    // The URL is cosmetic here; the state is already set.
  }
}

function createLangStore(): LangStore {
  let lang: Lang = DEFAULT_LANG;
  let ready = false;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());

  return {
    get: () => lang,
    isReady: () => ready,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    resolve() {
      const search = readSearch();
      lang = resolveLang(search, readStoredLang());
      const forced = new URLSearchParams(search).get(URL_PARAM);
      if (isLang(forced)) writeStoredLang(forced);
      ready = true;
      emit();
    },
    set(next) {
      lang = next;
      writeStoredLang(next);
      syncUrlLang(next);
      emit();
    },
  };
}

/**
 * Bring <html lang>, <title> and every description meta to `lang`, writing
 * only what differs — so calling it again when nothing changed writes nothing.
 */
function applyToDocument(lang: Lang): void {
  const t = LP_COPY[lang];
  if (document.documentElement.lang !== lang) document.documentElement.lang = lang;
  if (document.title !== t.metaTitle) document.title = t.metaTitle;
  for (const meta of document.querySelectorAll('meta[name="description"]')) {
    if (meta.getAttribute("content") !== t.metaDescription) meta.setAttribute("content", t.metaDescription);
  }
}

const serverLang = (): Lang => DEFAULT_LANG;
const serverReady = () => false;

type LangContextValue = {
  lang: Lang;
  /** True once the stored / URL choice has been applied (the toggle is live). */
  ready: boolean;
  setLang: (next: Lang) => void;
  /** The dictionary for the current language. */
  t: Copy;
};

// Outside a provider (a component rendered on its own, as the unit tests do)
// everything reads as Japanese and the toggle does nothing.
const LangContext = createContext<LangContextValue>({
  lang: DEFAULT_LANG,
  ready: false,
  setLang: () => {},
  t: LP_COPY[DEFAULT_LANG],
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createLangStore);
  const lang = useSyncExternalStore(store.subscribe, store.get, serverLang);
  const ready = useSyncExternalStore(store.subscribe, store.isReady, serverReady);

  useEffect(() => {
    store.resolve();
  }, [store]);

  // The route's Japanese metadata <title> and description are hoisted
  // elements React mounts in its own commit (react-dom commitMutationEffects,
  // HostHoistable): it claims the existing <title> and rewrites its text, and
  // inserts a new description <meta>. That commit can land AFTER this effect
  // has applied the visitor's language (measured: 12 of 40 loads of "click EN,
  // then reload"), leaving an English page under the Japanese title. So the
  // head is watched while the page is mounted, and anything that differs from
  // the current language is put back — applyToDocument writes only what
  // differs, so its own writes end the loop.
  //
  // Layout effect, not passive: on a client-side navigation away, the next
  // route mounts its own <title> in the same commit, and the observer must be
  // disconnected synchronously in that commit (disconnect discards the pending
  // records) rather than in a later passive cleanup, or it would stamp this
  // page's title onto the next one.
  useLayoutEffect(() => {
    applyToDocument(lang);
    const observer = new MutationObserver(() => applyToDocument(lang));
    observer.observe(document.head, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["content"],
    });
    return () => observer.disconnect();
  }, [lang]);

  useLayoutEffect(
    () => () => {
      document.documentElement.lang = DEFAULT_LANG;
    },
    []
  );

  const value = useMemo<LangContextValue>(
    () => ({ lang, ready, setLang: store.set, t: LP_COPY[lang] }),
    [lang, ready, store]
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): LangContextValue {
  return useContext(LangContext);
}
