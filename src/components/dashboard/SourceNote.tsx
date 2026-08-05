import { SOURCES, type SourceKey } from "@/lib/sources";

/**
 * Provenance line for a panel (design-spec-v1 §9).
 *
 * Every figure on screen must say where it came from, in what unit, and for
 * which year. An unattributed number in an investment tool is a liability, not
 * a feature — the panel that omits this is the one a reader cannot check.
 */
export default function SourceNote({
  source,
  unit,
  year,
  note,
}: {
  source: SourceKey;
  unit?: string;
  year?: string;
  note?: string;
}) {
  const s = SOURCES[source];
  const parts = [`出典: ${s.label}`];
  if (year) parts.push(year);
  if (unit) parts.push(`単位: ${unit}`);

  return (
    <p className="source-note mt-2">
      {parts.join(" ／ ")}
      {note ? <span className="block">{note}</span> : null}
    </p>
  );
}
