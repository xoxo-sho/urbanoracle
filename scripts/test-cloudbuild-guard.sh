#!/usr/bin/env bash
# Self-test for the degenerate-value guard in cloudbuild-submit.sh.
#
# The guard exists because a present-but-nonsense build arg once shipped: every
# NEXT_PUBLIC_* secret held the literal "-". These cases prove the guard rejects
# that class BEFORE a build is submitted, and accepts a well-formed set.
#
# gcloud is stubbed so nothing is submitted; the guard runs before any call.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUBMIT="$HERE/cloudbuild-submit.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Stub gcloud: reaching it means the guard let the value through.
printf '#!/usr/bin/env bash\necho "STUB_GCLOUD_REACHED" >&2\nexit 99\n' > "$WORK/gcloud"
chmod +x "$WORK/gcloud"
export PATH="$WORK:$PATH"

GOOD_API_KEY='AIzaSyA1234567890abcdefghijklmnopqrstuvw'
GOOD_APP_ID='1:490573289488:web:0123456789abcdef012345'
GOOD_AUTH='dxalabs-platform.firebaseapp.com'
GOOD_PROJECT='dxalabs-platform'
GOOD_SITE='https://urbanoracle.dxalabs.com'

PASSED=0; FAILED=0

run_guard() {
  env NEXT_PUBLIC_FIREBASE_API_KEY="$1" \
      NEXT_PUBLIC_FIREBASE_APP_ID="$2" \
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="$3" \
      NEXT_PUBLIC_FIREBASE_PROJECT_ID="$4" \
      NEXT_PUBLIC_SITE_URL="$5" \
      bash "$SUBMIT" testtag 2>&1
}

expect_reject() {
  local label="$1"; shift
  local out; out=$(run_guard "$@") ; local rc=$?
  if [ "$rc" -eq 0 ] || printf '%s' "$out" | grep -q STUB_GCLOUD_REACHED; then
    printf '  FAIL guard let it through: %s\n' "$label" >&2; FAILED=$((FAILED+1))
  else
    printf '  ok   rejected: %-52s\n' "$label"; PASSED=$((PASSED+1))
  fi
  # The value itself must never appear in the message.
  if printf '%s' "$out" | grep -qF -- "$1$2$3$4$5" 2>/dev/null; then
    printf '  FAIL guard printed a value: %s\n' "$label" >&2; FAILED=$((FAILED+1))
  fi
}

echo "cloudbuild-submit.sh guard self-test"

# The exact production incident.
expect_reject "API_KEY is the literal '-'"    '-' "$GOOD_APP_ID" "$GOOD_AUTH" "$GOOD_PROJECT" "$GOOD_SITE"
expect_reject "APP_ID is the literal '-'"     "$GOOD_API_KEY" '-' "$GOOD_AUTH" "$GOOD_PROJECT" "$GOOD_SITE"
expect_reject "AUTH_DOMAIN is the literal '-'" "$GOOD_API_KEY" "$GOOD_APP_ID" '-' "$GOOD_PROJECT" "$GOOD_SITE"
expect_reject "PROJECT_ID is the literal '-'" "$GOOD_API_KEY" "$GOOD_APP_ID" "$GOOD_AUTH" '-' "$GOOD_SITE"
expect_reject "SITE_URL is the literal '-'"   "$GOOD_API_KEY" "$GOOD_APP_ID" "$GOOD_AUTH" "$GOOD_PROJECT" '-'

expect_reject "API_KEY empty"                 '' "$GOOD_APP_ID" "$GOOD_AUTH" "$GOOD_PROJECT" "$GOOD_SITE"
expect_reject "API_KEY too short"             'AIzaSy' "$GOOD_APP_ID" "$GOOD_AUTH" "$GOOD_PROJECT" "$GOOD_SITE"
expect_reject "API_KEY wrong prefix"          'BIzaSyA1234567890abcdefghijklmnopqrstu' "$GOOD_APP_ID" "$GOOD_AUTH" "$GOOD_PROJECT" "$GOOD_SITE"
expect_reject "APP_ID wrong shape"            "$GOOD_API_KEY" 'not-an-app-id-at-all' "$GOOD_AUTH" "$GOOD_PROJECT" "$GOOD_SITE"
expect_reject "SITE_URL missing scheme"       "$GOOD_API_KEY" "$GOOD_APP_ID" "$GOOD_AUTH" "$GOOD_PROJECT" 'urbanoracle.dxalabs.com'

# A well-formed set must get PAST the guard (else the guard is over-strict and
# would block every real deploy).
out=$(run_guard "$GOOD_API_KEY" "$GOOD_APP_ID" "$GOOD_AUTH" "$GOOD_PROJECT" "$GOOD_SITE")
if printf '%s' "$out" | grep -q STUB_GCLOUD_REACHED; then
  printf '  ok   accepted: %-52s\n' "a well-formed value set reaches the submit"; PASSED=$((PASSED+1))
else
  printf '  FAIL well-formed values were rejected by the guard\n' >&2; FAILED=$((FAILED+1))
fi

echo
if [ "$FAILED" -gt 0 ]; then
  echo "GUARD SELF-TEST FAILED (${FAILED} wrong, ${PASSED} correct)" >&2; exit 1
fi
echo "guard self-test passed: ${PASSED}/${PASSED} cases behaved as expected"
