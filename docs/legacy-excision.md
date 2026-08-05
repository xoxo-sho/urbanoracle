# Legacy / Vercel Excision Checklist

Maps each Vercel/legacy item from the port-inventory recon to the migration
stage where it is removed. Nothing on this list is removed before its stage.

**Status: the migration is complete.** `main` is the new architecture and the
deploying branch; production is Cloud Run at `https://urbanoracle.dxalabs.com`.
Only item 9 remains, and it is a manual dashboard action (see below).

## The rollback target moved — and why

The original rule on this page was: *do not remove the Vercel deployment, it is
the rollback target*. That rule is now obsolete, and not because the cutover
succeeded — because **the cutover push destroyed the thing it protected**.

Vercel's GitHub integration was still connected at merge time. The push to
`main` therefore rebuilt `urbanoracle-seven.vercel.app` from the new tree, and
it now serves the new static export with no FastAPI behind it — `/api/v1/*`
returns 404 there against 200/401 on Cloud Run. The old application is no
longer what that host serves, so it can no longer roll anything back.

The rollback path is now Cloud Run, which is strictly better than what was
lost:

| | |
|---|---|
| **Revision rollback** | 4 revisions retained. `urbanoracle-00003-75n` (image tag `aac633d`, the pre-cutover build) is one `gcloud run services update-traffic --to-revisions` away — no rebuild, seconds to apply |
| **Source rollback** | pre-merge `main` is `5a267d1`; the merge commit is `990bed0` |
| **Cost of the change** | none — Cloud Run revision rollback was always available; the Vercel target was redundant before it was consumed |

The lesson worth keeping: a rollback target that shares a git trigger with the
thing it is protecting is not a rollback target. Disconnecting the integration
*before* the cutover push would have preserved it.

| # | Item | Location | Action | Target stage |
|---|------|----------|--------|--------------|
| 1 | `.vercel/` directory (project linkage) | `.vercel/project.json` | Remove | **DONE (Stage 8)** — removed; it was gitignored, so it never entered history |
| 2 | Hardcoded Vercel origin in sitemap | `src/app/sitemap.ts:6` | Replace with `NEXT_PUBLIC_SITE_URL`-derived origin | Stage 4/5 |
| 3 | robots.txt sitemap line + `Disallow: /api/` | `public/robots.txt` | Origin swap; reconsider `Disallow: /api/` once API is same-origin FastAPI | Stage 4/5 |
| 4 | Transport route self-HTTP fetch via `VERCEL_URL` | `src/app/api/transport/route.ts:52-54` | Becomes a local file read in the FastAPI port | Stage 3 |
| 5 | `next: { revalidate }` fetch caching (4 sites) | `src/lib/api/client.ts:19`, `src/lib/api/demographics.ts:78`, `src/lib/api/land-price.ts:58`, `src/app/api/transport/route.ts:57` | Caching re-decided server-side in Python | Stage 3 |
| 6 | Vercel/Next boilerplate SVGs | `public/vercel.svg`, `public/next.svg` | Remove (cosmetic) | Stage 3/4 |
| 7 | `test-results/.last-run.json` committed artifact | addon branch only | Not on `dxa-migration`; ignore (handled when the addon branch is folded in at Stage 4.5) | — |
| 8 | Dead code: lib fetchers referencing nonexistent files | `src/lib/api/transport.ts`, `src/lib/api/disaster-risk.ts` | Delete | Stage 3 |
| 9 | Live Vercel deployment | `urbanoracle-seven.vercel.app` | **OPEN — Sho manual, Vercel dashboard.** ① Settings → Git → **Disconnect** (stops further rebuilds; reversible; the step that actually matters) ② Settings → General → **Pause Project** (stops serving, keeps history). Deletion not required. The CLI is installed but its token is rejected, so no CLI mutation was attempted. Bundle-level retirement is already enforced: the host sits in verify-bundle `RETIRED_HOSTS`, self-test case f12 | Stage 8 — pending |
