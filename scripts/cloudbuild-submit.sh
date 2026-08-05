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
NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL:-https://urbanoracle.dxalabs.com}"
SITE_ORIGIN="${NEXT_PUBLIC_SITE_URL:-https://urbanoracle.dxalabs.com}"

# Poll ceiling tracks cloudbuild.yaml's timeout (1200s) plus queue time.
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-1500}"
POLL_INTERVAL_SECONDS="${POLL_INTERVAL_SECONDS:-15}"

# ---------------------------------------------------------------------------
# Degenerate-value guard
# ---------------------------------------------------------------------------
# A present-but-nonsense value is worse than a missing one: it builds, ships,
# and fails somewhere far from the cause. This happened for real — every
# NEXT_PUBLIC_* secret was once set to the literal string "-" (`gh secret set
# --body -` takes the value, and reads stdin only when --body is omitted), and
# the first symptom was `TypeError: Invalid URL, input: '-'` three minutes into
# a container build.
#
# So each value is checked for shape here, before anything is submitted. The
# checks name the offending variable and never print its value.
guard() {
  local name="$1" pattern="$2" description="$3" value="${!1:-}"

  if [ -z "${value}" ]; then
    echo "::error::${name} is empty — refusing to build a bundle without it" >&2
    exit 1
  fi
  if [ "${value}" = "-" ]; then
    echo "::error::${name} is the literal string '-' — this is the 'gh secret set --body -' mistake, not a real value" >&2
    exit 1
  fi
  if [ "${#value}" -lt 8 ]; then
    echo "::error::${name} is ${#value} characters — too short to be a real ${description}" >&2
    exit 1
  fi
  if ! printf '%s' "${value}" | grep -qE "${pattern}"; then
    echo "::error::${name} does not look like a ${description} (value withheld)" >&2
    exit 1
  fi
}

guard NEXT_PUBLIC_FIREBASE_API_KEY     '^AIza[0-9A-Za-z_-]{20,}$'  'Firebase browser API key (AIza…)'
guard NEXT_PUBLIC_FIREBASE_APP_ID      '^1:[0-9]{6,}:web:[0-9a-f]+$' 'Firebase web appId (1:<digits>:web:<hex>)'
guard NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN '^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' 'Firebase auth domain'
guard NEXT_PUBLIC_FIREBASE_PROJECT_ID  '^[a-z][a-z0-9-]{4,}$'      'GCP project id'
guard NEXT_PUBLIC_SITE_URL             '^https?://[A-Za-z0-9.-]+\.[A-Za-z]{2,}'  'site origin (http(s)://host)'

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
