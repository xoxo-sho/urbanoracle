#!/usr/bin/env bash
# Fault injection for scripts/verify-bundle.sh.
#
#   scripts/test-verify-bundle.sh
#
# The verifier is the gate that decides whether a bundle may ship, so it needs
# its own gate: each case below breaks exactly one assertion and requires the
# verifier to go red. Without this, a verifier that silently stopped checking
# something would keep reporting success forever.
#
# The fixture is synthetic rather than a real build: it can carry a real-shaped
# apiKey and appId, so the real-config assertions are exercised too — a
# structural CI build (dummy config, SKIP_REAL_CONFIG=1) never reaches them.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERIFY="$HERE/verify-bundle.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

ORIGIN="https://urbanoracle.dxalabs.com"
APP_ID='1:490573289488:web:0123456789abcdef012345'
OTHER_APP_ID='1:490573289488:web:fedcba9876543210fedcba'
API_KEY='AIzaSyA1234567890abcdefghijklmnopqrstuvw'

export EXPECT_SITE_ORIGIN="$ORIGIN"
export EXPECT_APP_ID="$APP_ID"

PASSED=0
FAILED=0

# sed -i differs between GNU and BSD; normalise.
sedi() { if sed --version >/dev/null 2>&1; then sed -i "$@"; else sed -i '' "$@"; fi; }

build_fixture() {
  local dir="$1"
  rm -rf "$dir"
  mkdir -p "$dir/_next/static/chunks" "$dir/app" "$dir/login" "$dir/pending"

  # Config chunk, shaped like a real inlined build.
  cat > "$dir/_next/static/chunks/config.js" <<EOF
const firebaseConfig={apiKey:"${API_KEY}",authDomain:"dxalabs-platform.firebaseapp.com",projectId:"dxalabs-platform",appId:"${APP_ID}"};
EOF

  # Landing page: prerendered, canonical + og on the expected origin.
  cat > "$dir/index.html" <<EOF
<!doctype html><html lang="ja"><head>
<link rel="canonical" href="${ORIGIN}"/>
<meta property="og:url" content="${ORIGIN}"/>
<meta property="og:image" content="${ORIGIN}/opengraph-image?abc123"/>
<script src="/_next/static/chunks/config.js"></script>
</head><body><h1>都市の資産価値を、上振れと下振れの両面から読み解く。</h1></body></html>
EOF

  # Dashboard shell: /_next/ assets, and deliberately NO canonical.
  cat > "$dir/app.html" <<EOF
<!doctype html><html lang="ja"><head>
<script src="/_next/static/chunks/config.js"></script>
</head><body><div id="dashboard"></div></body></html>
EOF

  cat > "$dir/login.html" <<EOF
<!doctype html><html lang="ja"><head>
<script src="/_next/static/chunks/config.js"></script>
</head><body><h2>サインイン</h2></body></html>
EOF

  cat > "$dir/pending.html" <<'EOF'
<!doctype html><html lang="ja"><body><h1>アクセスを審査中です</h1></body></html>
EOF

  cat > "$dir/404.html" <<'EOF'
<!doctype html><html lang="ja"><body><p>ページが見つかりません</p></body></html>
EOF

  printf '\x89PNG\r\n\x1a\n placeholder-bytes' > "$dir/opengraph-image"

  cat > "$dir/robots.txt" <<EOF
User-Agent: *
Allow: /

Sitemap: ${ORIGIN}/sitemap.xml
EOF

  cat > "$dir/sitemap.xml" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${ORIGIN}</loc></url></urlset>
EOF
}

expect_pass() {
  local label="$1" dir="$2"
  if bash "$VERIFY" "$dir" >/dev/null 2>&1; then
    printf '  ok   PASS as expected: %s\n' "$label"; PASSED=$((PASSED + 1))
  else
    printf '  FAIL expected a pass, got a failure: %s\n' "$label" >&2; FAILED=$((FAILED + 1))
  fi
}

expect_fail() {
  local label="$1" dir="$2"
  if bash "$VERIFY" "$dir" >/dev/null 2>&1; then
    printf '  FAIL verifier stayed GREEN on a broken bundle: %s\n' "$label" >&2; FAILED=$((FAILED + 1))
  else
    printf '  ok   RED as expected: %s\n' "$label"; PASSED=$((PASSED + 1))
  fi
}

echo "verify-bundle self-test"

# --- baseline: a well-formed bundle passes -------------------------------
build_fixture "$WORK/good"
expect_pass "well-formed bundle" "$WORK/good"

# --- THE DISCRIMINATOR ---------------------------------------------------
# The case Parallel City's bundle verifier could not express: in a single-Next
# build both halves carry /_next/, so only the canonical tag separates them.
build_fixture "$WORK/f01"
sedi 's#<script src="/_next/static/chunks/config.js"></script>#<link rel="canonical" href="'"$ORIGIN"'"/><script src="/_next/static/chunks/config.js"></script>#' "$WORK/f01/app.html"
expect_fail "DISCRIMINATOR: the LP is served at /app (canonical present on /app)" "$WORK/f01"

build_fixture "$WORK/f02"
cp "$WORK/f02/index.html" "$WORK/f02/app.html"
expect_fail "DISCRIMINATOR: /app is literally the landing page document" "$WORK/f02"

build_fixture "$WORK/f03"
cp "$WORK/f03/index.html" "$WORK/f03/login.html"
expect_fail "DISCRIMINATOR: the LP is served at /login" "$WORK/f03"

# --- config ---------------------------------------------------------------
build_fixture "$WORK/f04"
sedi 's/AIzaSy[0-9A-Za-z_-]*/devbuild-placeholder/' "$WORK/f04/_next/static/chunks/config.js"
expect_fail "placeholder survives into the bundle" "$WORK/f04"

build_fixture "$WORK/f05"
sedi 's/apiKey:"[^"]*"/apiKey:""/' "$WORK/f05/_next/static/chunks/config.js"
expect_fail "firebase apiKey missing" "$WORK/f05"

build_fixture "$WORK/f06"
sedi 's/projectId:"dxalabs-platform"/projectId:"some-other-project"/' "$WORK/f06/_next/static/chunks/config.js"
expect_fail "projectId mismatch (field-qualified, not a bare substring)" "$WORK/f06"

build_fixture "$WORK/f07"
sedi 's/authDomain:"[^"]*"/authDomain:"evil.firebaseapp.com"/' "$WORK/f07/_next/static/chunks/config.js"
expect_fail "authDomain mismatch" "$WORK/f07"

build_fixture "$WORK/f08"
sedi "s#appId:\"${APP_ID}\"#appId:\"${OTHER_APP_ID}\"#" "$WORK/f08/_next/static/chunks/config.js"
expect_fail "appId of a different web app in the shared project" "$WORK/f08"

build_fixture "$WORK/f09"
printf 'const other={appId:"%s"};\n' "$OTHER_APP_ID" >> "$WORK/f09/_next/static/chunks/config.js"
expect_fail "two distinct appIds in the bundle" "$WORK/f09"

# --- origins --------------------------------------------------------------
build_fixture "$WORK/f10"
printf 'const API="http://localhost:8000/api/v1";\n' >> "$WORK/f10/_next/static/chunks/config.js"
expect_fail "absolute dev origin baked in (localhost:8000)" "$WORK/f10"

build_fixture "$WORK/f11"
printf 'const API="https://urbanoracle-api-xyz-an.a.run.app";\n' >> "$WORK/f11/_next/static/chunks/config.js"
expect_fail "absolute Cloud Run origin baked in" "$WORK/f11"

build_fixture "$WORK/f12"
sedi "s#${ORIGIN}#https://urbanoracle-seven.vercel.app#g" "$WORK/f12/index.html"
expect_fail "the retired Vercel host is referenced in the bundle" "$WORK/f12"

# --- landing page ---------------------------------------------------------
build_fixture "$WORK/f13"
sedi 's#<h1>[^<]*</h1>#<div id="root"></div>#' "$WORK/f13/index.html"
expect_fail "LP is not prerendered (no <h1>)" "$WORK/f13"

build_fixture "$WORK/f14"
# [^>]* not [^/]*: the href contains slashes, so the narrower class silently
# matched nothing and left the fixture intact.
sedi 's#<link rel="canonical"[^>]*>##' "$WORK/f14/index.html"
expect_fail "LP has no canonical tag" "$WORK/f14"

build_fixture "$WORK/f15"
sedi 's#rel="canonical" href="[^"]*"#rel="canonical" href="https://example.com"#' "$WORK/f15/index.html"
expect_fail "canonical points at a foreign origin" "$WORK/f15"

build_fixture "$WORK/f16"
rm -f "$WORK/f16/opengraph-image"
expect_fail "og:image is referenced but absent from the build" "$WORK/f16"

build_fixture "$WORK/f17"
sedi 's#property="og:url" content="[^"]*"#property="og:url" content="https://example.com"#' "$WORK/f17/index.html"
expect_fail "og:url disagrees with the site origin" "$WORK/f17"

build_fixture "$WORK/f18"
rm -f "$WORK/f18/index.html"
expect_fail "landing page missing entirely" "$WORK/f18"

# --- shells ---------------------------------------------------------------
build_fixture "$WORK/f19"
rm -f "$WORK/f19/app.html"
expect_fail "dashboard shell missing" "$WORK/f19"

build_fixture "$WORK/f20"
sedi 's#<script src="/_next/static/chunks/config.js"></script>##' "$WORK/f20/app.html"
expect_fail "dashboard shell has no /_next/ asset (not a built Next page)" "$WORK/f20"

build_fixture "$WORK/f21"
rm -f "$WORK/f21/login.html"
expect_fail "/login missing — the sign-in route is unreachable" "$WORK/f21"

build_fixture "$WORK/f22"
rm -f "$WORK/f22/pending.html"
expect_fail "/pending missing — a pending user has nowhere to land" "$WORK/f22"

# --- crawlability ---------------------------------------------------------
build_fixture "$WORK/f23"
rm -f "$WORK/f23/robots.txt"
expect_fail "robots.txt missing" "$WORK/f23"

build_fixture "$WORK/f24"
sedi "s#${ORIGIN}/sitemap.xml#https://example.com/sitemap.xml#" "$WORK/f24/robots.txt"
expect_fail "robots.txt points at a foreign sitemap" "$WORK/f24"

build_fixture "$WORK/f25"
sedi "s#<loc>${ORIGIN}</loc>#<loc>https://example.com</loc>#" "$WORK/f25/sitemap.xml"
expect_fail "sitemap advertises the wrong origin" "$WORK/f25"

build_fixture "$WORK/f26"
rm -f "$WORK/f26/404.html"
expect_fail "404.html missing" "$WORK/f26"

# --- false-negative guards ------------------------------------------------
mkdir -p "$WORK/f27"
expect_fail "an empty directory is not a valid bundle" "$WORK/f27"

mkdir -p "$WORK/f28"
touch "$WORK/f28/index.html"
expect_fail "a directory with no .js is not a built bundle" "$WORK/f28"

echo
if [ "$FAILED" -gt 0 ]; then
  echo "SELF-TEST FAILED (${FAILED} case(s) wrong, ${PASSED} correct)" >&2
  exit 1
fi
echo "self-test passed: ${PASSED}/${PASSED} cases behaved as expected"
