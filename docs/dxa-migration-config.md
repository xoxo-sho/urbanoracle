# UrbanOracle — DXA Migration Config (source of truth)
Product: UrbanOracle (independent product; NOT Landcast, whose internal
  package is coincidentally named urbanoracle — no shared code)
GCP project: urbanoracle  (to be created before Stage 2)
Region: asia-northeast1
Site origin: https://urbanoracle.dxalabs.com
Cloud Run service: urbanoracle
Shared GIP tenant (read-mostly; writes require manual approval):
  dxalabs-platform (project number 490573289488)
Firebase web app displayName: UrbanOracle
  (created at Stage 5; appId TBD -> becomes verify-bundle EXPECT_APP_ID)
DB: Cloud SQL Postgres 15, instance urbanoracle-db (db-f1-micro)
  DATABASE_URL -> Secret Manager: urbanoracle-db-url
Build-args (Next-style, per Parallel City precedent; NOT Vite VITE_*):
  NEXT_PUBLIC_FIREBASE_API_KEY / _AUTH_DOMAIN / _PROJECT_ID / _APP_ID
  NEXT_PUBLIC_SITE_URL = https://urbanoracle.dxalabs.com
  NEXT_PUBLIC_BUILD_SHA = git sha (image tag)
Access model: CURATED — provision is_active=false (pending), manual
  activation by Sho; protected routes require is_active=true as a second
  gate. (PENDING SHO FINAL CONFIRM — do not implement until Stage 2.)
Capability set: aggregation UI + external-data proxy only. No ML, no PDF,
  no 3D. Image-level gates: verify-bundle ONLY (no model-load smoke, no
  CJK font-register smoke).
DisasterShield: included in v1 at Stage 4.5 (2 proxy routes + cross-product
  auth), folded in from the addon/disastershield-beta-integration branch.
Retired hosts (enter verify-bundle RETIRED_HOSTS at cutover, NOT before):
  urbanoracle-seven.vercel.app
