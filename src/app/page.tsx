import Link from "next/link";
import HeroSpread from "@/components/landing/HeroSpread";
import { SOURCES } from "@/lib/sources";

/**
 * Landing page (design-spec-v1 §4).
 *
 * Editorial density rather than marketing abstraction: the hero shows the
 * actual upside×downside spread instead of describing it, and every section
 * below carries figures, units and provenance. A reader should be able to
 * check the claim on the page they are reading it on.
 */

export const metadata = {
  title: "UrbanOracle — 東京23区の上振れと下振れ",
  description:
    "地価・人口・交通の上振れと、災害リスクの下振れを同一の意思決定面で読み解く都市データ計器。",
  // The landing page is the ONLY page that claims a canonical URL. That is
  // what lets verify-bundle tell the LP from the dashboard shell in a
  // single-Next build where both sides share /_next/ assets.
  alternates: { canonical: "/" },
};

const CAPABILITIES = [
  {
    side: "up" as const,
    label: "上振れ",
    title: "資産価値が伸びる根拠",
    body: "公示地価・取引価格の前年比、人口と年齢構成の推移、鉄道乗降客数の集積。エリアの伸びを支える指標を、区単位で並べて比較します。",
    sources: [SOURCES.reinfolib.label, SOURCES.estat.label, SOURCES.ksj.label],
  },
  {
    side: "down" as const,
    label: "下振れ",
    title: "価値を毀損する要因",
    body: "浸水・津波・土砂災害の想定規模をハザードマップ由来のデータで重ね、区ごとの災害リスクを地価と同じ画面で確認します。",
    sources: [SOURCES.hazard.label, SOURCES.disastershield.label],
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh flex flex-col">
      <header
        className="flex items-center justify-between px-6 py-3"
        style={{ borderBottom: "1px solid var(--rule)" }}
      >
        <span className="heading text-sm tracking-wide">UrbanOracle</span>
        <nav className="flex items-center gap-4 text-[11px]">
          <Link href="/login" className="text-muted-foreground hover:text-foreground">
            サインイン
          </Link>
        </nav>
      </header>

      <main className="flex-1">
        {/* ── Hero: the symmetry itself, in real numbers ── */}
        <section className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
          <p className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
            TOKYO 23 WARDS — LAND VALUE × RISK
          </p>
          <h1 className="heading mt-3 text-3xl leading-snug sm:text-4xl">
            都市の資産価値を、<br />
            上振れと下振れの両面から読み解く。
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            伸びしろだけを見ても、リスクだけを見ても、投資判断はできません。
            UrbanOracle は東京23区の地価・人口・交通と災害リスクを同一の面に置き、
            どちらか一方に偏らない比較を可能にします。
          </p>

          <div className="mt-8">
            <HeroSpread />
          </div>

          <div className="mt-8">
            <Link
              href="/login"
              className="inline-block rounded-sm px-5 py-2.5 text-sm font-medium"
              style={{ background: "var(--up-text)", color: "var(--background)" }}
            >
              アクセスを申請する
            </Link>
            <p className="mt-3 text-[11px] text-muted-foreground">
              一つのアカウントで DXA Labs の全プロダクトにアクセスできます。
            </p>
          </div>
        </section>

        {/* ── Capabilities: what each side of the axis actually contains ── */}
        <section
          className="mx-auto max-w-5xl px-6 py-12"
          style={{ borderTop: "1px solid var(--rule)" }}
        >
          <h2 className="heading text-xl">二つの軸</h2>
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
                  {cap.label}
                </p>
                <h3 className="heading mt-2 text-base">{cap.title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{cap.body}</p>
                <ul className="mt-4 space-y-1">
                  {cap.sources.map((source) => (
                    <li key={source} className="source-note">
                      {source}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        {/* ── Provenance: the credibility section is a table, not a promise ── */}
        <section
          className="mx-auto max-w-5xl px-6 py-12"
          style={{ borderTop: "1px solid var(--rule)" }}
        >
          <h2 className="heading text-xl">データ出典</h2>
          <p className="mt-2 text-xs text-muted-foreground">
            表示するすべての数値に、出典・単位・年次を明示します。
          </p>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-muted-foreground" style={{ borderBottom: "1px solid var(--rule)" }}>
                  <th className="py-2 pr-3 text-left font-medium">出典</th>
                  <th className="py-2 pr-3 text-left font-medium">内容</th>
                  <th className="py-2 text-left font-medium">年次</th>
                </tr>
              </thead>
              <tbody>
                {[
                  [SOURCES.reinfolib.label, "取引価格・地価（円/m²）", "2024年"],
                  [SOURCES.estat.label, "人口・世帯・年齢構成", "2020年"],
                  [SOURCES.ksj.label, "鉄道駅・乗降客数・行政区界", "2024年"],
                  [SOURCES.hazard.label, "浸水・津波・土砂災害の想定区域", "最新公開版"],
                  [SOURCES.disastershield.label, "物件単位の想定損失（Beta）", "導入予定"],
                ].map(([label, content, year]) => (
                  <tr key={label} style={{ borderBottom: "1px solid var(--rule)" }}>
                    <td className="py-2 pr-3">{label}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{content}</td>
                    <td className="py-2 font-mono tabular-nums text-muted-foreground">{year}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="source-note mt-3">
            地価表示位置は行政区の概算中心です（実際の取引地点とは異なります）
          </p>
        </section>
      </main>

      <footer className="px-6 py-4" style={{ borderTop: "1px solid var(--rule)" }}>
        <p className="text-[10px] text-muted-foreground">
          UrbanOracle — DXA Labs ／ OpenStreetMap contributors ／ CARTO
        </p>
      </footer>
    </div>
  );
}
