"use client";

import { LANGS, type Lang } from "@/i18n/lang";
import { useLang } from "@/i18n/lang-context";

/**
 * JA | EN segmented control in the LP header, immediately left of サインイン
 * (ported from landcast lp/src/components/landing/lang-toggle.tsx).
 *
 * Two real <button>s, so they are in the tab order and work with Enter and
 * Space without key handling; aria-pressed says which one is current, and the
 * group's accessible name is in the visitor's language plus English when the
 * page is Japanese. The pressed segment is drawn like the hero CTA (深紺 fill,
 * background-coloured text).
 *
 * Focus ring geometry (landcast's CI caught a ring bleeding into its group's
 * rounded border): the ring is 2px at a 1px offset, so it reaches 3px past a
 * segment; the group's padding and the gap between segments are both 4px, so
 * the ring always has 1px of the group's own surface between it and the
 * border or the other segment. Radii stay at rounded-sm (H項).
 */
export default function LangToggle() {
  const { lang, ready, setLang, t } = useLang();
  const labels: Record<Lang, string> = { ja: t.langJa, en: t.langEn };

  return (
    <div
      role="group"
      aria-label={t.langGroup}
      data-lang-toggle=""
      data-lang-ready={ready ? "true" : "false"}
      className="inline-flex items-center gap-1 rounded-sm border p-1"
      style={{ borderColor: "var(--rule-strong)" }}
    >
      {LANGS.map((code) => {
        const active = code === lang;
        return (
          <button
            key={code}
            type="button"
            aria-pressed={active}
            onClick={() => setLang(code)}
            className={`h-6 w-9 cursor-pointer rounded-sm text-[11px] font-medium leading-none tracking-wide transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring ${
              active ? "" : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
            style={active ? { background: "var(--up-text)", color: "var(--background)" } : undefined}
          >
            {labels[code]}
          </button>
        );
      })}
    </div>
  );
}
