"use client";

import Link from "next/link";
import HeroSpread, { heroSpreadCopy } from "@/components/landing/HeroSpread";
import LangToggle from "@/components/landing/LangToggle";
import { useLang } from "@/i18n/lang-context";
import type { LpKey } from "@/i18n/lp";
import {
  A55_NOTICES,
  A55_NOTICES_EN,
  A55_NOTICES_LABEL,
  A55_NOTICES_LABEL_EN,
  ESTAT_API_CREDIT,
  ESTAT_API_CREDIT_EN,
  HAZARD_PORTAL_SOURCE,
  HAZARD_PORTAL_SOURCE_EN,
  KIKENDO_CREDIT_EN,
  KIKENDO_EDITED,
  KSJ_A31_EDITED,
  KSJ_A33_EDITED,
  KSJ_A40_EDITED,
  KSJ_A31_EDITED_EN,
  KSJ_A33_EDITED_EN,
  KSJ_A40_EDITED_EN,
  KSJ_A49_EDITED,
  KSJ_A49_EDITED_EN,
  KSJ_A55_EDITED,
  KSJ_A55_EDITED_EN,
  KSJ_L01_EDITED,
  KSJ_L01_EDITED_EN,
  KSJ_N03_EDITED,
  KSJ_N03_EDITED_EN,
  KSJ_S12_EDITED,
  KSJ_S12_EDITED_EN,
  KSJ_SOURCE,
  KSJ_SOURCE_EN,
  TOCHI_CREDIT_EN,
  TOCHI_EDITED,
} from "@/lib/credits";

// The prescribed Japanese sentence, and on the English page its translation
// (marked as one) right after it. They live in lib/credits.ts, not in the
// LP dictionary: the Japanese is the same in both languages by rule.
const REQUIRED_NOTICES: { ja: string; en: string }[] = [
  { ja: ESTAT_API_CREDIT, en: ESTAT_API_CREDIT_EN },
  { ja: KSJ_SOURCE, en: KSJ_SOURCE_EN },
  { ja: KSJ_S12_EDITED, en: KSJ_S12_EDITED_EN },
  { ja: KSJ_N03_EDITED, en: KSJ_N03_EDITED_EN },
  { ja: KSJ_L01_EDITED, en: KSJ_L01_EDITED_EN },
  { ja: KSJ_A55_EDITED, en: KSJ_A55_EDITED_EN },
  // Real-data plan PR 7: the 東京都 CC BY credit with its 改変 sentence, the four
  // hazard datasets' 加工 lines and the hazard-map portal's 出典 line.
  { ja: KIKENDO_EDITED, en: KIKENDO_CREDIT_EN },
  { ja: KSJ_A31_EDITED, en: KSJ_A31_EDITED_EN },
  { ja: KSJ_A33_EDITED, en: KSJ_A33_EDITED_EN },
  { ja: KSJ_A40_EDITED, en: KSJ_A40_EDITED_EN },
  { ja: KSJ_A49_EDITED, en: KSJ_A49_EDITED_EN },
  { ja: HAZARD_PORTAL_SOURCE, en: HAZARD_PORTAL_SOURCE_EN },
  // Real-data plan PR 8: the 都市整備局 土地利用現況調査 table in the same 東京都 CC BY form.
  { ja: TOCHI_EDITED, en: TOCHI_CREDIT_EN },
];

// The A55 page's six 注意事項 (real-data plan PR 6), all of them, in their own
// block below the notices: the page says they must be read before the data is
// used, and the English page follows each with a marked translation.

/**
 * Landing page body (design-spec-v1 §4), in the visitor's language.
 *
 * Editorial density rather than marketing abstraction: the hero shows the
 * upside×downside spread instead of describing it, and every section below
 * carries figures, units and provenance. A reader should be able to check the
 * claim on the page they are reading it on — which is why the hero's units
 * line names its surveys and definitions, and the provenance table lists what
 * the code path fetches (no surface is a provisional sample since PR 4b).
 *
 * Every string comes from src/i18n/lp.ts. The markup is the page's markup as
 * it was before the toggle existed; in Japanese it renders the same text.
 */

const CAPABILITIES: { side: "up" | "down"; label: LpKey; title: LpKey; body: LpKey; sources: LpKey[] }[] = [
  {
    side: "up",
    label: "upLabel",
    title: "upTitle",
    body: "upBody",
    sources: ["srcEstat", "srcKsj"],
  },
  {
    side: "down",
    label: "downLabel",
    title: "downTitle",
    body: "downBody",
    sources: ["srcKikendo", "srcKsj", "srcHazard"],
  },
];

// What the current code path fetches (backend/routers/data.py + the tiles
// MapView loads client-side).
const LIVE_ROWS: [source: LpKey, content: LpKey, year: LpKey][] = [
  ["srcEstat", "liveEstat", "liveEstatYear"],
  ["srcEstat", "livePopTrend", "livePopTrendYear"],
  ["srcMencho", "liveMencho", "liveMenchoYear"],
  ["srcKsj", "liveStations", "liveStationsYear"],
  ["srcKsj", "liveRidershipTrend", "liveRidershipTrendYear"],
  ["srcKsj", "liveLandPrice", "liveLandPriceYear"],
  ["srcKsj", "liveZoning", "liveZoningYear"],
  ["srcKikendo", "liveQuake", "liveQuakeYear"],
  ["srcKsj", "liveDisasterKsj", "liveDisasterKsjYear"],
  ["srcTochi", "liveGreen", "liveGreenYear"],
  ["srcComparison", "liveComparison", "none"],
  ["srcHero", "liveHero", "liveHeroYear"],
  ["srcHazard", "liveHazard", "none"],
  ["srcBoundaries", "liveBoundaries", "none"],
  ["srcTiles", "liveTiles", "none"],
];

// Surfaces still fed from a sample set: none since real-data plan PR 4b
// (乗降客数推移 sums the S12 panel), so the table's sample group renders
// nothing. The group, its notice and SAMPLE_NOTICE are deleted in PR 9.
const SAMPLE_ROWS: [content: LpKey, scale: LpKey][] = [];

export default function LandingContent() {
  const { lang, t } = useLang();

  return (
    <div className="min-h-dvh flex flex-col">
      <header
        className="flex items-center justify-between px-6 py-3"
        style={{ borderBottom: "1px solid var(--rule)" }}
      >
        <span className="heading text-sm tracking-wide">{t.brand}</span>
        <nav className="flex items-center gap-4 text-[11px]">
          <LangToggle />
          <Link href="/login" className="text-muted-foreground hover:text-foreground">
            {t.headerSignIn}
          </Link>
        </nav>
      </header>

      <main className="flex-1">
        {/* ── Hero: the symmetry itself, in real numbers ── */}
        <section className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
          <p className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">{t.heroEyebrow}</p>
          <h1 className="heading mt-3 text-3xl leading-snug sm:text-4xl">
            {t.heroTitle1}
            <br />
            {t.heroTitle2}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">{t.heroBody}</p>

          <div className="mt-8">
            <HeroSpread copy={heroSpreadCopy(lang)} />
          </div>

          <div className="mt-8">
            <Link
              href="/login"
              className="inline-block rounded-sm px-5 py-2.5 text-sm font-medium"
              style={{ background: "var(--up-text)", color: "var(--background)" }}
            >
              {t.heroCta}
            </Link>
            <p className="mt-3 text-[11px] text-muted-foreground">{t.heroAccountNote}</p>
          </div>
        </section>

        {/* ── Capabilities: what each side of the axis actually contains ── */}
        <section
          className="mx-auto max-w-5xl px-6 py-12"
          style={{ borderTop: "1px solid var(--rule)" }}
        >
          <h2 className="heading text-xl">{t.capabilitiesTitle}</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {CAPABILITIES.map((cap) => (
              <article
                key={cap.side}
                className="rounded-sm border p-5"
                style={{
                  borderColor: "var(--surface-border)",
                  background: cap.side === "up" ? "var(--up-fill)" : "var(--down-fill)",
                }}
              >
                <p
                  className="text-[10px] tracking-[0.2em] uppercase"
                  style={{ color: cap.side === "up" ? "var(--up-text)" : "var(--down-text)" }}
                >
                  {t[cap.label]}
                </p>
                <h3 className="heading mt-2 text-base">{t[cap.title]}</h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{t[cap.body]}</p>
                <ul className="mt-4 space-y-1">
                  {cap.sources.map((source) => (
                    <li key={source} className="source-note">
                      {t[source]}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        {/* ── Provenance: the credibility section is a table, not a promise.
               What the current code path fetches; the sample group has had
               no row since real-data plan PR 4b. Years only where the code pins one. ── */}
        <section
          className="mx-auto max-w-5xl px-6 py-12"
          style={{ borderTop: "1px solid var(--rule)" }}
        >
          <h2 className="heading text-xl">{t.provTitle}</h2>
          <p className="mt-2 text-xs text-muted-foreground">{t.provIntro}</p>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-muted-foreground" style={{ borderBottom: "1px solid var(--rule)" }}>
                  <th className="py-2 pr-3 text-left font-medium">{t.thSource}</th>
                  <th className="py-2 pr-3 text-left font-medium">{t.thContent}</th>
                  <th className="py-2 text-left font-medium">{t.thYear}</th>
                </tr>
              </thead>
              <tbody data-provenance="live">
                <tr style={{ borderBottom: "1px solid var(--rule)" }}>
                  <th colSpan={3} className="pt-4 pb-1 text-left text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
                    {t.groupLive}
                  </th>
                </tr>
                {LIVE_ROWS.map(([source, content, year]) => (
                  <tr key={`${source}-${content}`} style={{ borderBottom: "1px solid var(--rule)" }}>
                    <td className="py-2 pr-3">{t[source]}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{t[content]}</td>
                    <td className="py-2 font-mono tabular-nums text-muted-foreground">{t[year]}</td>
                  </tr>
                ))}
              </tbody>
              {SAMPLE_ROWS.length > 0 && (
                <tbody data-provenance="sample" className="sample-block">
                  <tr style={{ borderBottom: "1px solid var(--rule)" }}>
                    <th colSpan={3} className="pt-4 pb-1 text-left text-[10px] tracking-[0.2em] uppercase">
                      {t.sampleNotice}
                    </th>
                  </tr>
                  {SAMPLE_ROWS.map(([content, scale]) => (
                    <tr key={content} style={{ borderBottom: "1px solid var(--rule)" }}>
                      <td className="py-2 pr-3">{t.srcSample}</td>
                      <td className="py-2 pr-3">{t[content]}</td>
                      <td className="py-2 font-mono tabular-nums">{t[scale]}</td>
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
          </div>
          {/* The providers' own wording, verbatim in both languages; the English
              page adds a translation after each sentence (RECON 2026-10-data-terms §7.1). */}
          <div className="mt-6 space-y-3 text-[11px] leading-relaxed text-muted-foreground" data-credit="required">
            <h3 className="text-[11px] font-semibold tracking-widest text-foreground">{t.provRequiredTitle}</h3>
            {REQUIRED_NOTICES.map((notice) => (
              <p key={notice.ja} lang="ja">
                {notice.ja}
                {lang === "en" && (
                  <span className="block" lang="en">
                    {notice.en}
                  </span>
                )}
              </p>
            ))}
            <div data-notices="a55" className="space-y-1">
              <p className="font-medium" lang="ja">
                {A55_NOTICES_LABEL}
                {lang === "en" && (
                  <span className="block font-normal" lang="en">
                    {A55_NOTICES_LABEL_EN}
                  </span>
                )}
              </p>
              <ul className="list-disc pl-4 space-y-1">
                {A55_NOTICES.map((ja, i) => (
                  <li key={ja} lang="ja">
                    {ja}
                    {lang === "en" && (
                      <span className="block" lang="en">
                        {A55_NOTICES_EN[i]}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>

      <footer className="px-6 py-4" style={{ borderTop: "1px solid var(--rule)" }}>
        <p className="text-[11px] text-muted-foreground">{t.footer}</p>
      </footer>
    </div>
  );
}
