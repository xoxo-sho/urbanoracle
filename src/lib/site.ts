/**
 * The origin this deployment claims to be.
 *
 * canonical, og:url, og:image, sitemap and robots all derive from this single
 * value, so they cannot drift apart — a page that advertises one origin while
 * being served from another is what breaks search indexing and link unfurls
 * long after a deploy looks fine.
 *
 * Injected at build time as NEXT_PUBLIC_SITE_URL (Stage 6 passes it as a
 * Docker build-arg); the default is the production origin from
 * docs/dxa-migration-config.md.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://urbanoracle.dxalabs.com";

export const SITE_NAME = "UrbanOracle";
