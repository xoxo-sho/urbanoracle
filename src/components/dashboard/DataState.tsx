import type { DataStatus } from "@/lib/use-gated-data";
import { cn } from "@/lib/utils";

/**
 * The two states a surface can be in before it has figures (RECON
 * 2026-10-uo-real-data §7.2): 読み込み中, with no numbers at all, and 取得失敗,
 * with the retry hint and the name of the source that did not answer. Never a
 * stale or sample number in their place — that was the falsehood this
 * replaces.
 */

export const LOADING_TEXT = "読み込み中";
export const FAILED_TEXT = "取得失敗";
export const RETRY_HINT = "時間をおいて再読み込みしてください";

export type PendingStatus = "loading" | "unavailable";

/** True while a surface has no payload to draw from. */
export function isPending(status: DataStatus): status is PendingStatus {
  return status === "loading" || status === "unavailable";
}

/** The word a single figure's slot shows while its surface is pending. */
export function pendingText(status: PendingStatus): string {
  return status === "loading" ? LOADING_TEXT : FAILED_TEXT;
}

/** What a surface shows in place of its figures while pending. */
export function StateNotice({
  status,
  source,
  className,
}: {
  status: PendingStatus;
  /** The source that has not answered, named so the reader knows what failed. */
  source?: string;
  className?: string;
}) {
  if (status === "loading") {
    return (
      <p role="status" data-state="loading" className={cn("state-note", className)}>
        {LOADING_TEXT}
      </p>
    );
  }
  return (
    <p role="status" data-state="unavailable" className={cn("state-note state-note-failed", className)}>
      {FAILED_TEXT} — {RETRY_HINT}
      {source ? <span className="block font-normal">{source}</span> : null}
    </p>
  );
}
