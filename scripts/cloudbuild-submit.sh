#!/usr/bin/env bash
# Submit the image build and exit non-zero unless it is a confirmed SUCCESS.
#
#   scripts/cloudbuild-submit.sh <image-tag>
#
# Why --async plus polling rather than a plain synchronous submit:
# `gcloud builds submit` streams its log, and every pipeline that pipes that
# stream through tail/grep reports the exit status of the LAST command in the
# pipe, not of the build. A failed build then looks like a success and the
# deploy step runs against an image that was never published. Polling
# `builds describe` and comparing the status field removes the pipeline from
# the decision entirely.
#
# Anything that is not exactly SUCCESS — FAILURE, TIMEOUT, CANCELLED,
# EXPIRED, or an unreadable status — exits non-zero. Ambiguity fails closed.
#
# Build-arg values are read from the environment and passed as substitutions;
# they are never echoed.

set -euo pipefail

IMAGE_TAG="${1:?usage: $0 <image-tag>}"
PROJECT_ID="${PROJECT_ID:-urbanoracle}"
REGION="${REGION:-asia-northeast1}"
SITE_ORIGIN="${NEXT_PUBLIC_SITE_URL:-https://urbanoracle.dxalabs.com}"

# Poll ceiling tracks cloudbuild.yaml's timeout (1200s) plus queue time.
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-1500}"
POLL_INTERVAL_SECONDS="${POLL_INTERVAL_SECONDS:-15}"

for required in NEXT_PUBLIC_FIREBASE_API_KEY NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
                NEXT_PUBLIC_FIREBASE_PROJECT_ID NEXT_PUBLIC_FIREBASE_APP_ID; do
  if [ -z "${!required:-}" ]; then
    echo "::error::${required} is not set — refusing to build a bundle without it" >&2
    exit 1
  fi
done

SUBSTITUTIONS="_IMAGE_TAG=${IMAGE_TAG}"
SUBSTITUTIONS="${SUBSTITUTIONS},_NEXT_PUBLIC_FIREBASE_API_KEY=${NEXT_PUBLIC_FIREBASE_API_KEY}"
SUBSTITUTIONS="${SUBSTITUTIONS},_NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN}"
SUBSTITUTIONS="${SUBSTITUTIONS},_NEXT_PUBLIC_FIREBASE_PROJECT_ID=${NEXT_PUBLIC_FIREBASE_PROJECT_ID}"
SUBSTITUTIONS="${SUBSTITUTIONS},_NEXT_PUBLIC_FIREBASE_APP_ID=${NEXT_PUBLIC_FIREBASE_APP_ID}"
SUBSTITUTIONS="${SUBSTITUTIONS},_SITE_ORIGIN=${SITE_ORIGIN}"

echo "Submitting build for tag ${IMAGE_TAG} (project ${PROJECT_ID}, region ${REGION})"

# The build runs as a service account we own, not the legacy Google-managed
# Cloud Build SA. That SA is not a per-project resource, so `actAs` on it cannot
# be scoped — granting it would have meant project-level serviceAccountUser on
# the deploy identity, which would also let it impersonate the default compute
# SA (roles/editor). A named build SA keeps the grant resource-scoped.
#
# urbanoracle-build@ holds only artifactregistry.writer, logging.logWriter, and
# read on the source bucket. It has no access to any secret.
BUILD_SA="${BUILD_SA:-projects/${PROJECT_ID}/serviceAccounts/urbanoracle-build@${PROJECT_ID}.iam.gserviceaccount.com}"

BUILD_ID="$(gcloud builds submit \
  --async \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --config cloudbuild.yaml \
  --service-account "${BUILD_SA}" \
  --substitutions "${SUBSTITUTIONS}" \
  --format='value(id)' \
  .)"

if [ -z "${BUILD_ID}" ]; then
  echo "::error::no build id returned — the submit did not start a build" >&2
  exit 1
fi
echo "Build id: ${BUILD_ID}"

elapsed=0
while [ "${elapsed}" -lt "${MAX_WAIT_SECONDS}" ]; do
  # $() rather than a pipe: a pipeline would report the exit status of its
  # last stage and mask a gcloud failure here.
  status="$(gcloud builds describe "${BUILD_ID}" \
    --project "${PROJECT_ID}" --region "${REGION}" --format='value(status)')" || status="UNREADABLE"

  case "${status}" in
    SUCCESS)
      echo "Build ${BUILD_ID} succeeded; image pushed."
      exit 0
      ;;
    WORKING | QUEUED | PENDING)
      sleep "${POLL_INTERVAL_SECONDS}"
      elapsed=$((elapsed + POLL_INTERVAL_SECONDS))
      ;;
    *)
      # FAILURE, TIMEOUT, CANCELLED, EXPIRED, UNREADABLE, or anything new.
      echo "::error::build ${BUILD_ID} ended with status '${status}' — not publishing" >&2
      exit 1
      ;;
  esac
done

echo "::error::build ${BUILD_ID} did not finish within ${MAX_WAIT_SECONDS}s" >&2
exit 1
