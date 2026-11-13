#!/usr/bin/env bash
# Refuse degenerate production build-arg values before the image is built.
#
#   scripts/ci/check-build-args.sh      (reads the five values from the env)
#
# Runs in ci.yml's image job, only on a main deploy, before the build whose
# image is pushed and deployed (it moved here from cloudbuild-submit.sh when
# the image build left Cloud Build). Exits 0 when all five are well formed,
# 1 on the first bad one. It names the variable and never prints its value.
#
# A present-but-nonsense value is worse than a missing one: it builds, ships,
# and fails somewhere far from the cause. This happened for real — every
# NEXT_PUBLIC_* secret was once set to the literal string "-" (`gh secret set
# --body -` takes the value, and reads stdin only when --body is omitted), and
# the first symptom was `TypeError: Invalid URL, input: '-'` three minutes into
# a container build.
#
# Self-test: scripts/test-build-args-guard.sh (npm run verify:guard).

set -euo pipefail

# The site origin has a default, as it had in cloudbuild-submit.sh and in the
# Dockerfile (ARG NEXT_PUBLIC_SITE_URL=https://urbanoracle.dxalabs.com).
NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL:-https://urbanoracle.dxalabs.com}"

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

echo "build-arg guard: the five production values are well formed (values withheld)"
