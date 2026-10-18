import {
  CONTACT_EMAIL,
  ESTAT_API_CREDIT,
  ESTAT_EDITED,
  ODPT_NOTICE,
  TOEI_CC_BY_CREDIT,
  formatFetchedAtJst,
} from "@/lib/credits";

/**
 * Notices a provider prescribes, shown next to the figures they cover
 * (RECON 2026-10-data-terms §7.1). Always expanded: a credit behind a hover or
 * a collapsed panel is not a credit.
 */

/** e-Stat: the 加工 statement and the API credit, once per census view. */
export function EstatCredits() {
  return (
    <div className="credit-block" data-credit="estat">
      <p>{ESTAT_EDITED}</p>
      <p>{ESTAT_API_CREDIT}</p>
    </div>
  );
}

/**
 * ODPT: the 取得日時 of the data (guideline 2.2.1), the notice for a published
 * application with its contact address (guideline 3.1), and the CC BY 4.0
 * credit for 東京都交通局 data (ODPT FAQ).
 */
export function OdptNotice({ fetchedAt }: { fetchedAt: string | null }) {
  const when = fetchedAt ? formatFetchedAtJst(fetchedAt) : null;
  return (
    <div className="credit-block" data-credit="odpt">
      {when && <p>{when}</p>}
      <p>
        {ODPT_NOTICE}
        <br />
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>
      <p>{TOEI_CC_BY_CREDIT}</p>
    </div>
  );
}
