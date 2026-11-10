"use client";

import type { ReactNode } from "react";
import type { DepthShares, DisasterWard, FieldSources, ZoningComposition } from "@/types";
import type { DataStatus } from "@/lib/use-gated-data";
import { SOURCES } from "@/lib/sources";
import { zoningLine } from "@/lib/census-sources";
import { designatedLine, formatShare, topTypes, typeStyle } from "@/lib/zoning";
import { DEEP_LABEL, K2_LABEL, QUAKE_KINDS, countOf, hazardLine } from "@/lib/disaster";
import { A31_NOTICES, A33_NOTICE, TAKASHIO_AS_OF_LEAD, TAKASHIO_CLASS_NOTE } from "@/lib/credits";
import { TakashioCredits } from "@/components/dashboard/RequiredCredits";
import { StateNotice, isPending } from "@/components/dashboard/DataState";
import { NO_DATA } from "@/lib/format";

/**
 * The 災害 tab (real-data plan PR 7, Architect decisions 1, 8 and the
 * sub-decisions of 2026-11-05): each hazard in its source's own classes, with
 * the source and its 時点 read from the payload — no Lv.1–5 scale, no count
 * of records, no threshold word of ours.
 *
 *   地震   東京都 地域危険度 第9回: the 町丁目 per rank 1–5 for 総合・建物倒壊・火災,
 *          said to be a relative evaluation among the 都's 町丁目;
 *   洪水   国土数値情報 A31a-25 想定最大規模: the share of the ward's area per
 *          浸水深 class, and the share with 浸水深 3 m 以上;
 *   高潮   東京都港湾局・建設局「高潮浸水想定区域図」（令和6年12月改定）: the share
 *          of the ward's area per class — the classes the figures had before,
 *          at the same boundaries — with its 時点, that statement about the
 *          classes and the 都's credit (follow-up 3, Architect decision B);
 *   土砂   国土数値情報 A33-25: 警戒区域 / 特別警戒区域 per 現象 (0 is a zero);
 *   津波   the 対象外 statement with its basis;
 *   用途地域 (D2) the A55-24 composition (real-data plan PR 6), unchanged.
 *
 * While the /disaster-risks answer is pending each hazard surface says
 * 読み込み中 or 取得失敗 and names its source — never a figure in their place.
 */

interface DisasterRiskPanelProps {
  /** The record in view: the selected ward's, or the 23区's; null while pending. */
  disaster: DisasterWard | null;
  /** State of the /disaster-risks answer. */
  disasterStatus: DataStatus;
  /** The /disaster-risks payload's `sources`: per hazard the survey or edition, its year and table. */
  disasterSources?: FieldSources;
  /** The 用途地域 composition in view (real-data plan PR 6): the selected ward's, or the 23区's; null while pending. */
  zoning: ZoningComposition | null;
  /** State of the /zoning answer. */
  zoningStatus: DataStatus;
  /** The /zoning payload's `sources`: the 国土数値情報 edition and tables. */
  zoningSources?: FieldSources;
  selectedWard: string | null;
}

/** The mini-bar's legend lists this many types by share; the rest are counted. */
const LEGEND_N = 5;

/** Ranks 1–5 and depth classes are ordered magnitudes: one downside hue, lighter to stronger. */
const RANK_STYLE = [
  { background: "var(--chart-5)" },
  { background: "var(--chart-4)" },
  { background: "var(--down-fill)", outline: "1px solid var(--down-ui)" },
  { background: "var(--down-ui)" },
  { background: "var(--down-text)" },
];
function classStyle(index: number, count: number) {
  const step = Math.round((index / Math.max(count - 1, 1)) * (RANK_STYLE.length - 1));
  return RANK_STYLE[step];
}

function Title({ children }: { children: ReactNode }) {
  return <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{children}</h4>;
}

function SourceLine({ sources, hazard }: { sources: FieldSources; hazard: string }) {
  return <p className="source-note mt-2">出典: {hazardLine(sources, hazard) ?? NO_DATA}</p>;
}

/** A stacked bar and a list of classes, each with its share of the ward's area. */
function DepthBlock({ block, attr, region }: { block: DepthShares; attr: "flood" | "tide"; region: string }) {
  const outside = Math.max(0, 100 - block.share);
  return (
    <>
      <div className="flex h-3 rounded-full overflow-hidden mt-2" style={{ background: "var(--secondary)" }} title={`${region}: 区域外 ${formatShare(outside)}`}>
        {block.classes.map((c, i) => (
          <div key={c.code} style={{ width: `${c.share}%`, ...classStyle(i, block.classes.length) }} title={`${c.label}: ${formatShare(c.share)}`} />
        ))}
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5">
        {block.classes.map((c, i) => (
          <li
            key={c.code}
            className="flex items-center gap-1.5 text-[10px]"
            {...(attr === "flood" ? { "data-flood-class": "" } : { "data-tide-class": "" })}
            data-code={c.code}
            data-share={c.share}
          >
            <span className="h-2 w-2 rounded-full shrink-0" style={classStyle(i, block.classes.length)} />
            <span className="text-muted-foreground flex-1">浸水深 {c.label}</span>
            <span className="tabular-nums text-foreground">{formatShare(c.share)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[10px] text-muted-foreground">区の面積に占める割合（区域内 計 {formatShare(block.share)}）</p>
    </>
  );
}

function Pending({ status, source }: { status: DataStatus; source: string }) {
  return isPending(status) ? <StateNotice status={status} source={source} /> : <p className="state-note">{NO_DATA}</p>;
}

export default function DisasterRiskPanel({
  disaster,
  disasterStatus,
  disasterSources = {},
  zoning,
  zoningStatus,
  zoningSources = {},
  selectedWard,
}: DisasterRiskPanelProps) {
  const region = disaster?.region ?? selectedWard ?? "東京23区";

  // 用途地域 (D2, real-data plan PR 6): the same composition and metric as the
  // 用途地域 tab — shares of the ward's designated area.
  const zoningPending = isPending(zoningStatus);
  const zoningProvenance = zoningLine(zoningSources);
  const legendTypes = zoning ? topTypes(zoning, LEGEND_N) : [];
  const d = isPending(disasterStatus) ? null : disaster;

  return (
    <div className="space-y-4">
      {/* 地震 — 東京都 地域危険度 第9回 */}
      <section className="chart-section" data-surface="disaster-earthquake">
        <Title>地震（地域危険度）— {region}</Title>
        {d === null ? (
          <Pending status={disasterStatus} source={`地震: ${SOURCES.tokyoKikendo.label}`} />
        ) : (
          <>
            <p className="text-[11px] text-foreground" data-rank5>
              {K2_LABEL}: <span className="font-semibold tabular-nums">{countOf(d.earthquake.rank5, d.earthquake.n)}</span>
            </p>
            <div className="mt-2 space-y-2">
              {QUAKE_KINDS.map(({ key, name }) => {
                const counts = d.earthquake.ranks[key];
                return (
                  <div key={key} data-quake-kind data-kind={key} data-ranks={counts.join(",")}>
                    <div className="flex items-baseline justify-between text-[10px]">
                      <span className="text-foreground">{name}</span>
                      <span className="text-muted-foreground">町丁目数（全{d.earthquake.n.toLocaleString("ja-JP")}）</span>
                    </div>
                    <div className="flex h-3 rounded-full overflow-hidden mt-1" style={{ background: "var(--secondary)" }}>
                      {counts.map((c, i) => (
                        <div key={i} style={{ width: `${(c / d.earthquake.n) * 100}%`, ...RANK_STYLE[i] }} title={`ランク${i + 1}: ${c}`} />
                      ))}
                    </div>
                    <div className="mt-0.5 flex justify-between text-[9px] tabular-nums text-muted-foreground">
                      {counts.map((c, i) => (
                        <span key={i}>
                          ランク{i + 1} <span className="text-foreground">{c}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">{d.earthquake.relative}</p>
            <SourceLine sources={disasterSources} hazard="earthquake" />
          </>
        )}
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        {/* 洪水 — A31a-25 想定最大規模 */}
        <section className="chart-section" data-surface="disaster-flood">
          <Title>洪水（想定最大規模）</Title>
          {d === null ? (
            <Pending status={disasterStatus} source={`洪水: ${SOURCES.ksj.label}`} />
          ) : (
            <>
              <p className="text-[11px] text-foreground" data-deep data-share={d.flood.deepShare}>
                {DEEP_LABEL}: <span className="font-semibold tabular-nums">{formatShare(d.flood.deepShare)}</span>
                <span className="text-muted-foreground">（区の面積に占める割合）</span>
              </p>
              <DepthBlock block={d.flood} attr="flood" region={region} />
              <ul className="mt-2 space-y-0.5 text-[9px] leading-snug text-muted-foreground">
                {A31_NOTICES.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
              <SourceLine sources={disasterSources} hazard="flood" />
            </>
          )}
        </section>

        {/* 高潮 — 東京都 高潮浸水想定区域図（令和6年12月改定） */}
        <section className="chart-section" data-surface="disaster-hightide">
          <Title>高潮（想定最大規模）</Title>
          {d === null ? (
            <Pending status={disasterStatus} source={`高潮: ${SOURCES.tokyoTakashio.label}`} />
          ) : (
            <>
              <DepthBlock block={d.hightide} attr="tide" region={region} />
              {/* The 時点 the payload names (the revision), and what the classes are. */}
              {disasterSources.hightide ? (
                <p className="mt-1 text-[10px] text-foreground" data-as-of data-as-of-text={disasterSources.hightide.table}>
                  {TAKASHIO_AS_OF_LEAD}
                  {disasterSources.hightide.table}
                </p>
              ) : null}
              <p className="mt-1 text-[9px] leading-snug text-muted-foreground" data-class-note>
                {TAKASHIO_CLASS_NOTE}
              </p>
              <SourceLine sources={disasterSources} hazard="hightide" />
              <TakashioCredits />
            </>
          )}
        </section>

        {/* 土砂 — A33-25 */}
        <section className="chart-section" data-surface="disaster-landslide">
          <Title>土砂災害警戒区域</Title>
          {d === null ? (
            <Pending status={disasterStatus} source={`土砂災害: ${SOURCES.ksj.label}`} />
          ) : (
            <>
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left font-normal">現象</th>
                    <th className="text-right font-normal">警戒区域</th>
                    <th className="text-right font-normal">特別警戒区域</th>
                  </tr>
                </thead>
                <tbody>
                  {d.landslide.phenomena.map((p) => (
                    <tr key={p.code} data-phenomenon data-name={p.name} data-warning={p.warning} data-special={p.special}>
                      <td className="text-foreground">{p.name}</td>
                      <td className="text-right tabular-nums">{p.warning}</td>
                      <td className="text-right tabular-nums">{p.special}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-[10px] text-muted-foreground">区の範囲に掛かる区域の数（区域番号の数）。0 は該当する区域がないこと</p>
              <p className="mt-1 text-[9px] leading-snug text-muted-foreground">{A33_NOTICE}</p>
              <SourceLine sources={disasterSources} hazard="landslide" />
            </>
          )}
        </section>

        {/* 津波 — A40-23: 対象外 with its basis */}
        <section className="chart-section" data-surface="disaster-tsunami">
          <Title>津波</Title>
          {d === null ? (
            <Pending status={disasterStatus} source={`津波: ${SOURCES.ksj.label}`} />
          ) : (
            <>
              <p className="text-[11px] leading-relaxed text-foreground" data-tsunami-status={d.tsunami.status}>
                {d.tsunami.text}
              </p>
              <SourceLine sources={disasterSources} hazard="tsunami" />
            </>
          )}
        </section>
      </div>

      {/* 用途地域 (D2) — stacked horizontal bar from the A55-24 snapshot */}
      <section className="chart-section" data-surface="disaster-zoning">
        <Title>用途地域</Title>
        {zoningPending ? (
          <StateNotice status={zoningStatus} source={`用途地域: ${SOURCES.ksj.label}`} />
        ) : zoning === null ? (
          <p className="state-note">{NO_DATA}</p>
        ) : (
          <>
            <div className="flex h-4 rounded-full overflow-hidden mt-3" data-zoning-bar>
              {zoning.types.map((t, i) => (
                <div
                  key={t.code}
                  data-zoning-segment
                  data-code={t.code}
                  data-share={t.share}
                  style={{ width: `${t.share}%`, ...typeStyle(i) }}
                  title={`${t.name}: ${formatShare(t.share)}`}
                />
              ))}
            </div>
            <div className="mt-3 space-y-1">
              {legendTypes.map((t) => (
                <div key={t.code} className="flex items-center gap-2" data-zoning-type data-code={t.code} data-name={t.name} data-share={t.share} data-m2={t.m2}>
                  <span className="h-2 w-2 rounded-full shrink-0" style={typeStyle(zoning.types.indexOf(t))} />
                  <span className="text-[10px] text-muted-foreground truncate flex-1">{t.name}</span>
                  <span className="text-[10px] tabular-nums text-foreground">{formatShare(t.share)}</span>
                </div>
              ))}
              {zoning.types.length > LEGEND_N && (
                <span className="text-[9px] text-muted-foreground">他 {zoning.types.length - LEGEND_N} 区分</span>
              )}
            </div>
            <p className="mt-2 text-[10px] text-foreground" data-designated data-share-of-ward={zoning.designatedShare}>
              {designatedLine(zoning, selectedWard)}
            </p>
            <p className="text-[10px] text-muted-foreground" data-as-of data-as-of-date={zoning.asOf.date ?? ""}>
              {zoning.asOf.text}
            </p>
            <p className="source-note mt-2">
              {`出典: ${SOURCES.ksj.label}`}
              {zoningProvenance ? ` ／ ${zoningProvenance}` : ""}
            </p>
          </>
        )}
      </section>
    </div>
  );
}
