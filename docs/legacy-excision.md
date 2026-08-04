# Legacy / Vercel Excision Checklist

Maps each Vercel/legacy item from the port-inventory recon to the migration
stage where it is removed. Nothing on this list is removed before its stage.

> **The live Vercel deployment (`urbanoracle-seven.vercel.app`):
> DO NOT REMOVE until post-deploy cutover verified — rollback target
> (Parallel City precedent).** Retirement is a separate approved step after
> the `urbanoracle.dxalabs.com` cutover checks pass.

| # | Item | Location | Action | Target stage |
|---|------|----------|--------|--------------|
| 1 | `.vercel/` directory (project linkage) | `.vercel/project.json` | Remove | At cutover |
| 2 | Hardcoded Vercel origin in sitemap | `src/app/sitemap.ts:6` | Replace with `NEXT_PUBLIC_SITE_URL`-derived origin | Stage 4/5 |
| 3 | robots.txt sitemap line + `Disallow: /api/` | `public/robots.txt` | Origin swap; reconsider `Disallow: /api/` once API is same-origin FastAPI | Stage 4/5 |
| 4 | Transport route self-HTTP fetch via `VERCEL_URL` | `src/app/api/transport/route.ts:52-54` | Becomes a local file read in the FastAPI port | Stage 3 |
| 5 | `next: { revalidate }` fetch caching (4 sites) | `src/lib/api/client.ts:19`, `src/lib/api/demographics.ts:78`, `src/lib/api/land-price.ts:58`, `src/app/api/transport/route.ts:57` | Caching re-decided server-side in Python | Stage 3 |
| 6 | Vercel/Next boilerplate SVGs | `public/vercel.svg`, `public/next.svg` | Remove (cosmetic) | Stage 3/4 |
| 7 | `test-results/.last-run.json` committed artifact | addon branch only | Not on `dxa-migration`; ignore (handled when the addon branch is folded in at Stage 4.5) | — |
| 8 | Dead code: lib fetchers referencing nonexistent files | `src/lib/api/transport.ts`, `src/lib/api/disaster-risk.ts` | Delete | Stage 3 |
| 9 | Live Vercel deployment | `urbanoracle-seven.vercel.app` | Retire as separate approved step AFTER cutover; hostname then enters verify-bundle `RETIRED_HOSTS` (not before — see config) | Post-cutover |
