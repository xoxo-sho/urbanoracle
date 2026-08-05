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
  Created 2026-08-05 via the Firebase Console (Sho, approved shared-tenant
  write). Read back at Stage 5b: state ACTIVE, 4 web apps total, and the three
  existing products (PropScore / Parallel City / Landcast) unchanged — the
  survival of the siblings is the verification signal, not the appearance of
  our own app.
  appId  = 1:490573289488:web:b0728d5dbb859cb2e51295
    -> this is verify-bundle's EXPECT_APP_ID. It is the ONLY config field that
       differs between products on the shared tenant, which is why the bundle
       verifier pins it exactly.
  apiKey = AIzaSyACnVKweLecPztSmm6dIKkzWPkUTzF1jPU
    -> SHARED, not new: apiKeyId b032c4d1-2cc0-4bbf-bb3f-6de48022123a, byte-for
       -byte identical to the key PropScore / Parallel City / Landcast use. The
       Console attached the existing browser key rather than minting one.
    -> A browser API key is a public identifier that ships inside the JS bundle,
       not a secret; access is decided server-side by RS256 verification plus the
       curated is_active gate. It is recorded here because the value is the same
       one any visitor can read from the deployed bundle.
  authDomain = dxalabs-platform.firebaseapp.com
  projectId  = dxalabs-platform
  Verified at Stage 5b with a real-config build (no SKIP_REAL_CONFIG): the
  strict verify-bundle path passes, and a bundle built with Landcast's appId
  is rejected with "built against the wrong Firebase web app".
  KNOWN LIMIT of that check: one GitHub Secret feeds BOTH the build-arg and
  EXPECT_APP_ID, so the verifier proves the bundle contains what was injected
  — it cannot prove the injected value is the right one. A wrong secret is
  caught by comparing against the appId recorded above, which came from a
  tenant read-back rather than from the pipeline.
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

## Stage 6 deploy notes
- Cloud Run deploy MUST pass --service-account=urbanoracle-run@urbanoracle.iam.gserviceaccount.com
  explicitly. Omitting it silently runs the service as the default compute SA
  (89383988887-compute@) which holds roles/editor — a declaration-vs-reality
  gap. Runtime identity = urbanoracle-run (cloudsql.client + secretAccessor on
  urbanoracle-db-url only).
- Stripping roles/editor from the default compute SA is a SEPARATE later item,
  to be decided only after Stage 6 confirms nothing depends on it.
