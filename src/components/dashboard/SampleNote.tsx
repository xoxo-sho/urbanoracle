import { SAMPLE_NOTICE, SOURCES } from "@/lib/sources";
import { cn } from "@/lib/utils";

/**
 * Warning line for a surface whose numbers are sample or provisional.
 *
 * Sits where SourceNote sits on a live panel, but reads as a warning rather
 * than a citation: a sample figure has no upstream to cite, and dressing it
 * in a ministry's name was the falsehood this component replaces. The
 * optional `note` carries what is still true about the surface — its unit,
 * its scale — never a source.
 */
export default function SampleNote({ note, className }: { note?: string; className?: string }) {
  return (
    <p role="note" data-provenance="sample" className={cn("sample-note mt-2", className)}>
      <span className="sample-tag" aria-hidden>
        SAMPLE
      </span>
      <span>{SAMPLE_NOTICE}</span>
      {note ? <span className="sample-note-detail">{note}</span> : null}
    </p>
  );
}

/** Compact form for a key-metric tile: the label alone, with the full notice on hover. */
export function SampleTag() {
  return (
    <span className="sample-tag" data-provenance="sample" title={SAMPLE_NOTICE}>
      {SOURCES.sample.label}
    </span>
  );
}
