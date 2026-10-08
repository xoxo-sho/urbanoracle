"use client";

import Link from "next/link";
import HeroSpread, { heroSpreadCopy } from "@/components/landing/HeroSpread";
import LangToggle from "@/components/landing/LangToggle";
import { useLang } from "@/i18n/lang-context";
import type { LpKey } from "@/i18n/lp";

/**
 * Landing page body (design-spec-v1 §4), in the visitor's language.
 *
 * Editorial density rather than marketing abstraction: the hero shows the
 * upside×downside spread instead of describing it, and every section below
 * carries figures, units and provenance. A reader should be able to check the
 * claim on the page they are reading it on — which is why the hero says
 * SAMPLE and the provenance table separates what the code path fetches from
 * what is still a provisional sample.
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
    sources: ["srcReinfolib", "srcEstat", "srcOdpt"],
  },
  {
    side: "down",
    label: "downLabel",
    title: "downTitle",
    body: "downBody",
    sources: ["srcHazard"],
  },
];

// What the current code path fetches (backend/routers/data.py + the tiles
// MapView loads client-side). REINFOLIB is fetched and handed to the
// dashboard, but no layer draws it yet; the row says exactly that.
const LIVE_ROWS: [source: LpKey, content: LpKey, year: LpKey][] = [
  ["srcReinfolib", "liveReinfolib", "liveReinfolibYear"],
  ["srcEstat", "liveEstat", "liveEstatYear"],
  ["srcOdpt", "liveOdpt", "none"],
  ["srcHazard", "liveHazard", "none"],
  ["srcBoundaries", "liveBoundaries", "none"],
  ["srcTiles", "liveTiles", "none"],
];

// Surfaces still fed from src/data/sample.ts, or from a hardcoded table.
const SAMPLE_ROWS: [content: LpKey, scale: LpKey][] = [
  ["sampleHero", "none"],
  ["sampleLandPrice", "none"],
  ["samplePopulation", "none"],
  ["sampleDisaster", "none"],
  ["sampleZoning", "none"],
  ["sampleRidership", "none"],
  ["sampleRadar", "sampleRadarScale"],
  ["sampleChoropleth", "none"],
];

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
               Two groups: what the current code path fetches, and what is
               still a provisional sample. Years only where the code pins one. ── */}
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
                  <tr key={source} style={{ borderBottom: "1px solid var(--rule)" }}>
                    <td className="py-2 pr-3">{t[source]}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{t[content]}</td>
                    <td className="py-2 font-mono tabular-nums text-muted-foreground">{t[year]}</td>
                  </tr>
                ))}
              </tbody>
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
            </table>
          </div>
          <p className="source-note mt-3">
            {t.stationNoteLabel}
            {t.stationNote}
          </p>
        </section>
      </main>

      <footer className="px-6 py-4" style={{ borderTop: "1px solid var(--rule)" }}>
        <p className="text-[10px] text-muted-foreground">{t.footer}</p>
      </footer>
    </div>
  );
}
