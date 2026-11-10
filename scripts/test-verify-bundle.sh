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
# Named as scripts/vendor-fonts.mjs names a font: <subset>-<first 16 hex of sha256>.woff2
FONT_FILE='latin-0123456789abcdef.woff2'

export EXPECT_SITE_ORIGIN="$ORIGIN"
export EXPECT_APP_ID="$APP_ID"

PASSED=0
FAILED=0

# sed -i differs between GNU and BSD; normalise.
sedi() { if sed --version >/dev/null 2>&1; then sed -i "$@"; else sed -i '' "$@"; fi; }

build_fixture() {
  local dir="$1"
  rm -rf "$dir"
  mkdir -p "$dir/_next/static/chunks" "$dir/app" "$dir/login" "$dir/pending" "$dir/auth"

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
<!doctype html><html lang="ja"><body><h1>メールを確認してください</h1></body></html>
EOF

  # The link in the verification mail lands here (Stage 2).
  cat > "$dir/auth/action.html" <<'EOF'
<!doctype html><html lang="ja"><body><h1>確認しています…</h1></body></html>
EOF

  cat > "$dir/404.html" <<'EOF'
<!doctype html><html lang="ja"><body><p>ページが見つかりません</p></body></html>
EOF

  printf '\x89PNG\r\n\x1a\n placeholder-bytes' > "$dir/opengraph-image"

  # The vendored web fonts: one face in the emitted CSS, its file under /fonts/.
  mkdir -p "$dir/fonts/geist"
  printf 'wOF2 placeholder-bytes' > "$dir/fonts/geist/${FONT_FILE}"
  cat > "$dir/_next/static/chunks/fonts.css" <<EOF
@font-face{font-family:Geist;font-style:normal;font-weight:100 900;font-display:swap;src:url(/fonts/geist/${FONT_FILE})format("woff2")}
EOF

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

# A red verifier is not enough for the sample-layer checks: a fixture that
# trips two of them would hide one that stopped firing. This requires the
# verifier's own failure line for the named check, and — with the count — that
# no other check failed.
expect_fail_naming() {
  local label="$1" dir="$2" needle="$3" out status failures
  out=$(bash "$VERIFY" "$dir" 2>&1); status=$?
  failures=$(printf '%s\n' "$out" | grep -c '^  FAIL ')
  if [ "$status" -eq 0 ]; then
    printf '  FAIL verifier stayed GREEN on a broken bundle: %s\n' "$label" >&2; FAILED=$((FAILED + 1))
  elif ! printf '%s\n' "$out" | grep -qF -- "FAIL sample layer: ${needle} is in the bundle"; then
    printf '  FAIL verifier went red without naming %s: %s\n' "$needle" "$label" >&2; FAILED=$((FAILED + 1))
  elif [ "$failures" -ne "${4:-1}" ]; then
    printf '  FAIL expected %s failure line(s), got %s: %s\n' "${4:-1}" "$failures" "$label" >&2; FAILED=$((FAILED + 1))
  else
    printf '  ok   RED as expected, naming %s: %s\n' "$needle" "$label"; PASSED=$((PASSED + 1))
  fi
}

# The web-font checks (4d): the verifier's own failure line, and no other.
expect_fail_line() {
  local label="$1" dir="$2" needle="$3" out status failures
  out=$(bash "$VERIFY" "$dir" 2>&1); status=$?
  failures=$(printf '%s\n' "$out" | grep -c '^  FAIL ')
  if [ "$status" -eq 0 ]; then
    printf '  FAIL verifier stayed GREEN on a broken bundle: %s\n' "$label" >&2; FAILED=$((FAILED + 1))
  elif ! printf '%s\n' "$out" | grep -qF -- "FAIL ${needle}"; then
    printf '  FAIL verifier went red without the line "%s": %s\n' "$needle" "$label" >&2; FAILED=$((FAILED + 1))
  elif [ "$failures" -ne 1 ]; then
    printf '  FAIL expected 1 failure line, got %s: %s\n' "$failures" "$label" >&2; FAILED=$((FAILED + 1))
  else
    printf '  ok   RED as expected, with "%s": %s\n' "$needle" "$label"; PASSED=$((PASSED + 1))
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

# --- retired ridership client (follow-up 3: the name may appear — in the credit — the client may not) ---
build_fixture "$WORK/f30"
printf 'const API="https://api.odpt.org/api/v4/odpt:PassengerSurvey?acl:consumerKey=x";\n' >> "$WORK/f30/_next/static/chunks/config.js"
expect_fail "the retired ridership client's keyed endpoint is in a chunk" "$WORK/f30"

build_fixture "$WORK/f31"
printf 'fetch("https://api-public.odpt.org/api/v4/odpt:PassengerSurvey");\n' >> "$WORK/f31/_next/static/chunks/config.js"
expect_fail "a request to the public endpoint is in a chunk" "$WORK/f31"

build_fixture "$WORK/f31b"
printf 'const KEY=process.env.ODPT_API_KEY;\n' >> "$WORK/f31b/_next/static/chunks/config.js"
expect_fail "the retired key's variable name is in a chunk" "$WORK/f31b"

build_fixture "$WORK/f31c"
sedi 's#<h1>#<p>東京都交通局・公共交通オープンデータ協議会、東京都交通局 乗降者数情報</p><h1>#' "$WORK/f31c/index.html"
expect_pass "the センター's credit on the landing page is allowed" "$WORK/f31c"

# --- the sample layer (real-data plan PR 9) ---------------------------------
CHUNK="_next/static/chunks/config.js"

# The wording. 「サンプルデータ（暫定）」 contains 「サンプル」 too, so two lines fail.
build_fixture "$WORK/f32"
printf 'const SOURCE_LABEL="サンプルデータ（暫定）";\n' >> "$WORK/f32/$CHUNK"
expect_fail_naming "the sample label is back in a chunk" "$WORK/f32" '「サンプルデータ」' 2

build_fixture "$WORK/f33"
sedi 's#<h1>#<p>サンプル値</p><h1>#' "$WORK/f33/index.html"
expect_fail_naming "a サンプル wording on the landing page" "$WORK/f33" '「サンプル」'

build_fixture "$WORK/f34"
sedi 's#<div id="dashboard"></div>#<div id="dashboard"><span>固定の参考値 — 実データではありません</span></div>#' "$WORK/f34/app.html"
expect_fail_naming "the fixed-value note is back on the dashboard shell" "$WORK/f34" '「固定の参考値」'

build_fixture "$WORK/f35"
printf 'const en={notice:"Sample data (provisional) — not real data"};\n' >> "$WORK/f35/$CHUNK"
expect_fail_naming "the English sample notice is back in a chunk" "$WORK/f35" '「Sample data (provisional)」'

# 「SAMPLE」 as a label: a JSX child in a chunk, and text between tags.
build_fixture "$WORK/f36"
printf 'x.jsx("span",{"aria-hidden":!0,children:"SAMPLE"});\n' >> "$WORK/f36/$CHUNK"
expect_fail_naming "a SAMPLE tag in a chunk" "$WORK/f36" '「SAMPLE」 as a label'

build_fixture "$WORK/f37"
sedi 's#<div id="dashboard"></div>#<div id="dashboard"><span>SAMPLE</span></div>#' "$WORK/f37/app.html"
expect_fail_naming "a SAMPLE tag prerendered on the dashboard shell" "$WORK/f37" '「SAMPLE」 as a label'

# The deleted identifiers, one at a time, as a build would carry them.
n=0
for ident in SampleNote SampleTag SAMPLE_NOTICE SAMPLE_SURFACES SAMPLE_ROWS sampleNotice srcSample; do
  n=$((n + 1))
  build_fixture "$WORK/f38-$n"
  printf 'e.s(["%s",0,t]);\n' "$ident" >> "$WORK/f38-$n/$CHUNK"
  expect_fail_naming "the deleted identifier ${ident} in a chunk" "$WORK/f38-$n" "the identifier ${ident}"
done

build_fixture "$WORK/f39"
printf 'const l=u.SOURCES.sample.label;\n' >> "$WORK/f39/$CHUNK"
expect_fail_naming "a read of SOURCES.sample's label" "$WORK/f39" 'the identifier SOURCES.sample (a read of .sample.label)'

n=0
for class in sample-note sample-tag sample-legend sample-block; do
  n=$((n + 1))
  build_fixture "$WORK/f40-$n"
  mkdir -p "$WORK/f40-$n/_next/static/css"
  printf '.%s{color:var(--down-text)}\n' "$class" > "$WORK/f40-$n/_next/static/css/app.css"
  expect_fail_naming "the deleted class .${class} in the emitted CSS" "$WORK/f40-$n" "the class ${class}"
done

build_fixture "$WORK/f41"
printf 'x.jsxs("div",{"data-provenance":"sample",children:[]});\n' >> "$WORK/f41/$CHUNK"
expect_fail_naming "the footer's sample group in a chunk" "$WORK/f41" 'the sample provenance group (data-provenance … sample)'

build_fixture "$WORK/f42"
sedi 's#<h1>#<table><tbody data-provenance="sample"></tbody></table><h1>#' "$WORK/f42/index.html"
expect_fail_naming "the LP table's sample group in the HTML" "$WORK/f42" 'the sample provenance group (data-provenance … sample)'

build_fixture "$WORK/f43"
printf 'return{status:"ok",data:e.data,isLive:!!e.isLive};\n' >> "$WORK/f43/$CHUNK"
expect_fail_naming "isLive read from a response in a chunk" "$WORK/f43" 'the identifier isLive (any casing, alone or inside a longer name)'

build_fixture "$WORK/f44"
printf 'x.jsx(M,{stations:k,transportIsLive:"ok"===s.status});\n' >> "$WORK/f44/$CHUNK"
expect_fail_naming "isLive inside a longer prop name" "$WORK/f44" 'the identifier isLive (any casing, alone or inside a longer name)'

# False-positive guard: the names a real build does carry (measured on the
# export of d1eda4e: maplibre's `sampler`, the easing curve's `sampleCurveX`,
# Next's `validationSamples`) and WebGL's SAMPLES constants are not the label.
build_fixture "$WORK/f45"
printf 'uniform sampler2D u;this.sampleCurveX(t);r.validationSamples;gl.SAMPLES;gl.SAMPLE_COVERAGE;MULTISAMPLE;i.sampleCount;\n' >> "$WORK/f45/$CHUNK"
expect_pass "third-party names containing 'sample' are not the sample layer" "$WORK/f45"

# --- web fonts (vendored; nothing from Google) ------------------------------
build_fixture "$WORK/f50"
printf '@import url("https://fonts.googleapis.com/css2?family=Geist&display=swap");\n' >> "$WORK/f50/_next/static/chunks/fonts.css"
expect_fail_line "a stylesheet imports from fonts.googleapis.com" "$WORK/f50" 'web fonts: fonts.googleapis.com is referenced in the bundle (1 file(s), first: _next/static/chunks/fonts.css)'

build_fixture "$WORK/f51"
sedi 's#<script src#<link rel="preload" as="font" href="https://fonts.gstatic.com/s/geist/v4/x.woff2"/><script src#' "$WORK/f51/index.html"
expect_fail_line "the landing page preloads a font from fonts.gstatic.com" "$WORK/f51" 'web fonts: fonts.gstatic.com is referenced in the bundle (1 file(s), first: index.html)'

build_fixture "$WORK/f52"
printf 'const css="https://fonts.googleapis.com/css2?family=Noto+Sans+JP";\n' >> "$WORK/f52/_next/static/chunks/config.js"
expect_fail_line "a chunk fetches a stylesheet from fonts.googleapis.com" "$WORK/f52" 'web fonts: fonts.googleapis.com is referenced in the bundle (1 file(s), first: _next/static/chunks/config.js)'

build_fixture "$WORK/f53"
rm -f "$WORK/f53/fonts/geist/${FONT_FILE}"
expect_fail_line "the stylesheet names a font file that is not in the bundle" "$WORK/f53" "web fonts: 1 of 1 referenced font file(s) are not in the bundle (first: /fonts/geist/${FONT_FILE})"

build_fixture "$WORK/f54"
rm -rf "$WORK/f54/fonts"
sedi 's#<script src#<link rel="preload" as="font" href="/fonts/geist-mono/latin-fedcba9876543210.woff2"/><script src#' "$WORK/f54/index.html"
expect_fail_line "public/fonts was left out of the image" "$WORK/f54" 'web fonts: 2 of 2 referenced font file(s) are not in the bundle (first: /fonts/geist-mono/latin-fedcba9876543210.woff2)'

build_fixture "$WORK/f55"
rm -f "$WORK/f55/_next/static/chunks/fonts.css"
expect_fail_line "the vendored stylesheet is not in the bundle" "$WORK/f55" 'web fonts: nothing in the bundle references a vendored font under /fonts/ — the stylesheet is missing'

# False-positive guard: the identity hosts a real bundle does name are on
# googleapis.com too, and are not Google Fonts.
build_fixture "$WORK/f56"
printf 'const IDENTITY="https://identitytoolkit.googleapis.com/v1",TOKEN="https://securetoken.googleapis.com/v1";\n' >> "$WORK/f56/_next/static/chunks/config.js"
expect_pass "identitytoolkit / securetoken on googleapis.com are not Google Fonts" "$WORK/f56"

# --- content types (every extension in the bundle is in MEDIA_TYPES) -------
build_fixture "$WORK/f57"
printf 'II*\0' > "$WORK/f57/_next/static/chunks/photo.tiff"
expect_fail_line "a file type the backend has no Content-Type for" "$WORK/f57" 'content types: the bundle has file type(s) with no entry in MEDIA_TYPES (backend/core/spa.py): .tiff'

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

build_fixture "$WORK/f29"
rm -f "$WORK/f29/auth/action.html"
expect_fail "/auth/action missing — the link in the verification mail has nowhere to land" "$WORK/f29"

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
