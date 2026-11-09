"use client";

import { FAILED_TEXT, LOADING_TEXT, RETRY_HINT } from "@/components/dashboard/DataState";
import { NO_DATA } from "@/lib/format";
import { TIE_RULE, extremes, rankOf, type Measure } from "@/lib/comparison";

/**
 * 「23区の中での位置」 (real-data plan PR 8, Architect decision 7): in place of
 * the radar and its 23区平均 polygon, one row per measure — the ward's value
 * and unit, its 23-ward rank on a 1–23 scale (順位), the 23区 figure for the 23
 * wards as a whole, and the source with its 時点. With no ward selected, each
 * row shows the 23区 figure and the highest and the lowest ward.
 *
 * The rank orders values only (largest first, stated on each row); it says
 * nothing about better or worse, and there is no score.
 */

const WARD_COUNT = 23;

function wardsText(wards: string[]): string {
  return wards.length > 1 ? `${wards[0]}ほか${wards.length - 1}区` : wards[0];
}

function RankScale({ rank }: { rank: number }) {
  const left = `${((rank - 1) / (WARD_COUNT - 1)) * 100}%`;
  return (
    <div
      data-rank-scale
      role="img"
      aria-label={`順位 ${rank}位（1〜${WARD_COUNT}位）`}
      className="flex items-center gap-1.5 text-[9px] tabular-nums text-muted-foreground"
    >
      <span aria-hidden>1</span>
      {/* h-audit: data-mark — the marker is the rank's position on the 1–23 scale. */}
      <span aria-hidden className="relative h-1 flex-1 rounded-full" style={{ background: "var(--chart-section-border)" }}>
        <span
          className="absolute top-1/2 h-2.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ left, background: "var(--foreground)" }}
        />
      </span>
      <span aria-hidden>{WARD_COUNT}</span>
    </div>
  );
}

function Row({ m, selectedWard }: { m: Measure; selectedWard: string | null }) {
  const header = (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[11px] font-medium text-foreground">{m.label}</span>
      <span className="shrink-0 text-[9px] text-muted-foreground">{m.order}</span>
    </div>
  );
  if (m.state !== "ok") {
    return (
      <li data-measure={m.key} data-state={m.state} className="border-t border-border/50 py-2">
        {header}
        <p role="status" className={m.state === "loading" ? "state-note mt-1" : "state-note state-note-failed mt-1"}>
          {m.state === "loading" ? LOADING_TEXT : `${FAILED_TEXT} — ${RETRY_HINT}`}
        </p>
      </li>
    );
  }
  const total = m.total;
  const ext = selectedWard ? null : extremes(m.values);
  const value = selectedWard ? m.values[selectedWard] : undefined;
  const ranked = selectedWard && m.complete ? rankOf(m.values, selectedWard) : null;
  const note = selectedWard && m.note ? m.note(selectedWard) : null;
  return (
    <li data-measure={m.key} data-state="ok" className="border-t border-border/50 py-2 space-y-1">
      {header}
      {selectedWard && (
        <div className="flex items-baseline justify-between gap-2">
          <span data-value={value ?? undefined} className="text-sm font-bold tabular-nums text-foreground">
            {value === undefined ? NO_DATA : m.format(value)}
            {note && <span className="ml-1 text-[10px] font-normal text-muted-foreground">（{note}）</span>}
          </span>
          {ranked ? (
            <span data-rank={ranked.rank} data-tied={String(ranked.tied)} className="shrink-0 text-[11px] font-semibold tabular-nums">
              {ranked.rank}位<span className="font-normal text-muted-foreground">／{WARD_COUNT}区{ranked.tied ? "（同順位あり）" : ""}</span>
            </span>
          ) : (
            <span className="shrink-0 text-[10px] text-muted-foreground">順位: {NO_DATA}</span>
          )}
        </div>
      )}
      {ranked && <RankScale rank={ranked.rank} />}
      {ext && m.complete && (
        <div className="grid grid-cols-2 gap-2 text-[10px] tabular-nums">
          <span data-max>
            <span className="text-muted-foreground">最も大きい区 </span>
            {wardsText(ext.max.wards)} {m.format(ext.max.value)}
          </span>
          <span data-min className="text-right">
            <span className="text-muted-foreground">最も小さい区 </span>
            {wardsText(ext.min.wards)} {m.format(ext.min.value)}
          </span>
        </div>
      )}
      <div className="text-[10px] tabular-nums">
        <span className="text-muted-foreground">23区全体 </span>
        <span data-total={total ?? undefined}>{total === null ? NO_DATA : m.format(total)}</span>
      </div>
      {m.source && (
        <p data-source={m.key} className="source-note">
          出典: {m.source}
        </p>
      )}
    </li>
  );
}

export default function WardComparison({ measures, selectedWard }: { measures: Measure[]; selectedWard: string | null }) {
  return (
    <section className="chart-section" data-surface="ward-comparison" aria-labelledby="ward-comparison-title">
      <h4 id="ward-comparison-title" className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        23区の中での位置{selectedWard ? `（${selectedWard}）` : ""}
      </h4>
      <p className="text-[10px] leading-snug text-muted-foreground">
        {selectedWard
          ? `${selectedWard}の値と23区の中での順位（1〜${WARD_COUNT}位、各行に記した順）。${TIE_RULE}。`
          : `区を選ぶと、その区の値と順位を表示します。各行は23区全体の値と、値の最も大きい区・小さい区。順位は各行に記した順で、${TIE_RULE}。`}
        23区全体は23区の合計から求めた値です。
      </p>
      <ul className="mt-1">
        {measures.map((m) => (
          <Row key={m.key} m={m} selectedWard={selectedWard} />
        ))}
      </ul>
    </section>
  );
}
