#!/usr/bin/env bash
# Verify the built front-end (Next static export) before it ships.
#
#   scripts/verify-bundle.sh <bundle-dir>
#
# Runs against the BUILD OUTPUT (locally frontend/out; inside the image
# /app/static). Next inlines NEXT_PUBLIC_* at compile time, so a wrong or
# missing build-arg is invisible in the source and observable only here.
#
# Landcast's precedent: a dev build shipped with a placeholder API key and
# nothing in the pipeline objected. Deployed, it would have served a sign-in
# screen that could never authenticate.
#
# Values are never echoed. Failures report masked evidence (a short prefix
# plus a length) so a build log can be diagnosed without leaking the bundle.
#
# Environment:
#   EXPECT_AUTH_DOMAIN   default dxalabs-platform.firebaseapp.com
#   EXPECT_PROJECT_ID    default dxalabs-platform
#   EXPECT_APP_ID        optional. When set, the bundle must contain exactly
#                        this appId and no other — the only check that catches
#                        a bundle built against another product's web app.
#   EXPECT_SITE_ORIGIN   default https://urbanoracle.dxalabs.com
#   SKIP_REAL_CONFIG     1 for structural builds (CI type-check builds carry
#                        dummy config, so the real-config assertions cannot
#                        apply). Structural checks still run.
#   RETIRED_HOSTS        hosts that must not appear anywhere in the build.

set -uo pipefail

DIR="${1:?usage: $0 <bundle-dir>}"
EXPECT_AUTH_DOMAIN="${EXPECT_AUTH_DOMAIN:-dxalabs-platform.firebaseapp.com}"
EXPECT_PROJECT_ID="${EXPECT_PROJECT_ID:-dxalabs-platform}"
EXPECT_APP_ID="${EXPECT_APP_ID:-}"
EXPECT_SITE_ORIGIN="${EXPECT_SITE_ORIGIN:-https://urbanoracle.dxalabs.com}"
SKIP_REAL_CONFIG="${SKIP_REAL_CONFIG:-0}"

# Hosts that must never appear in a shipped bundle.
#
# urbanoracle-seven.vercel.app is now retired at BOTH levels: the build must
# not reference it (sitemap/robots/canonical derive from NEXT_PUBLIC_SITE_URL)
# and the deployment itself is gone as of the Stage 8 cutover. It stays listed
# permanently — a retired host reappearing in a bundle means a stale env var or
# a reverted config, which is exactly the regression this catches.
#
# The staged CUTOVER_RETIRED_HOSTS variable that used to sit here folded into
# this list at cutover, as designed: the check itself never changed.
RETIRED_HOSTS="${RETIRED_HOSTS:-urbanoracle-seven.vercel.app supabase.co}"

if [ ! -d "$DIR" ]; then
  echo "FAIL: bundle directory not found: $DIR" >&2
  exit 1
fi
if [ -z "$(find "$DIR" -name '*.js' -type f -print -quit 2>/dev/null)" ]; then
  echo "FAIL: no .js files under $DIR — is this a built bundle?" >&2
  exit 1
fi

FAILURES=0
pass() { printf '  ok   %s\n' "$1"; }
fail() { printf '  FAIL %s\n' "$1" >&2; FAILURES=$((FAILURES + 1)); }

# Short prefix plus length: enough to tell "wrong value" from "no value",
# without publishing the value.
mask() {
  local v="$1"
  if [ ${#v} -le 6 ]; then printf '***(%d chars)' "${#v}"
  else printf '%s…(%d chars)' "${v:0:4}" "${#v}"; fi
}

echo "Verifying bundle: $DIR"

# --------------------------------------------------------------------------
# 1. Placeholder strings must not survive into a shipped bundle
# --------------------------------------------------------------------------
PLACEHOLDERS='devbuild-placeholder|ci-placeholder|test-build-key|your_api_key_here|your_firebase_api_key_here|YOUR_API_KEY|changeme|change-me|REPLACE_ME|xxxxxxxx'
hits=$(grep -rhoE "$PLACEHOLDERS" "$DIR" 2>/dev/null | sort -u)
if [ -n "$hits" ]; then
  fail "placeholder value(s) present in bundle: $(echo "$hits" | tr '\n' ' ')"
else
  pass "no placeholder values"
fi

# --------------------------------------------------------------------------
# 2. Real Firebase config
# --------------------------------------------------------------------------
if [ "$SKIP_REAL_CONFIG" = "1" ]; then
  echo "  skip real-config checks (SKIP_REAL_CONFIG=1)"
else
  key=$(grep -rhoE 'AIza[0-9A-Za-z_-]{35}' "$DIR" 2>/dev/null | head -1)
  if [ -n "$key" ]; then pass "firebase apiKey present  [$(mask "$key")]"
  else fail "no firebase apiKey (expected /AIza[0-9A-Za-z_-]{35}/) — build args were not applied"; fi

  # Field-qualified, not a bare substring search: `grep -F dxalabs-platform`
  # is satisfied by authDomain (dxalabs-platform.firebaseapp.com) and would
  # pass a bundle whose projectId is something else entirely.
  check_field() {
    local field="$1" expected="$2" values count
    values=$(grep -rhoE "[\"']?${field}[\"']?[[:space:]]*:[[:space:]]*[\"'][^\"']*[\"']" "$DIR" 2>/dev/null \
             | sed -E "s/.*[\"']([^\"']*)[\"']$/\1/" | sort -u)
    if [ -z "$values" ]; then
      fail "${field} not found in bundle — the Firebase config was not inlined as expected"
      return
    fi
    count=$(printf '%s\n' "$values" | wc -l | tr -d ' ')
    if [ "$count" -gt 1 ]; then
      fail "${field}: bundle contains ${count} distinct values — expected exactly one"
    elif [ "$values" = "$expected" ]; then
      pass "${field} = ${expected}"
    else
      fail "${field} mismatch: bundle has '$(mask "$values")', expected '${expected}'"
    fi
  }

  check_field authDomain "$EXPECT_AUTH_DOMAIN"
  check_field projectId "$EXPECT_PROJECT_ID"

  # appId is the only config field that differs between web apps inside the
  # shared dxalabs-platform project. Without pinning it, a bundle built
  # against PropScore's or Landcast's web app is indistinguishable from ours.
  found_ids=$(grep -rhoE '1:[0-9]{6,}:web:[0-9a-f]+' "$DIR" 2>/dev/null | sort -u)
  if [ -z "$found_ids" ]; then
    fail "no firebase appId in bundle (expected /1:<number>:web:<hex>/)"
  else
    count=$(printf '%s\n' "$found_ids" | wc -l | tr -d ' ')
    if [ -n "$EXPECT_APP_ID" ]; then
      if [ "$count" -gt 1 ]; then
        fail "bundle contains $count distinct appIds — expected exactly one"
      elif [ "$found_ids" = "$EXPECT_APP_ID" ]; then
        pass "appId matches the expected web app  [$(mask "$found_ids")]"
      else
        fail "appId mismatch: bundle has [$(mask "$found_ids")], expected [$(mask "$EXPECT_APP_ID")] — built against the wrong Firebase web app"
      fi
    else
      pass "firebase appId present  [$(mask "$(printf '%s' "$found_ids" | head -1)")] (EXPECT_APP_ID unset — identity not pinned)"
    fi
  fi
fi

# --------------------------------------------------------------------------
# 3. No absolute API origin — the client must stay same-origin
# --------------------------------------------------------------------------
# next.config's dev-only rewrite is ignored by an export build, so an absolute
# origin baked into the bundle would be the only thing the browser could call
# — and it would call the wrong host.
for pattern in 'localhost:8000' '127\.0\.0\.1:8000' '\.run\.app' 'vercel\.app'; do
  if grep -rqE "$pattern" "$DIR" 2>/dev/null; then
    fail "absolute origin '$pattern' present — the client must use the relative /api/v1"
  else
    pass "no absolute origin: $pattern"
  fi
done

# --------------------------------------------------------------------------
# 4. Retired hosts
# --------------------------------------------------------------------------
for host in $RETIRED_HOSTS; do
  if grep -rqF "$host" "$DIR" 2>/dev/null; then
    fail "retired host '${host}' still referenced in the bundle"
  else
    pass "no reference to retired host: ${host}"
  fi
done

# --------------------------------------------------------------------------
# 4b. Retired live client
# --------------------------------------------------------------------------
# Real-data plan PR 4 (Architect decision 3, 2026-11-02): ridership comes from
# the committed 国土数値情報 S12 snapshot and the ODPT client left the code
# path. Follow-up 3 (Architect decision A, 2026-11-09) brought the センター's
# name back into the bundle on purpose — 東京都交通局's own figures, committed
# from its public endpoint, are shown beside S12's with the credit its licence
# prescribes — so the name is no longer the signal. What must never be in a
# bundle is the client: the API hosts (keyed or public), the token parameter
# and the key's variable name. Any of them means a request at run time.
RETIRED_SOURCES="${RETIRED_SOURCES:-api.odpt.org api-public.odpt.org consumerKey ODPT_API_KEY}"
for source in $RETIRED_SOURCES; do
  if grep -rqF "$source" "$DIR" 2>/dev/null; then
    fail "retired ridership client '${source}' still referenced in the bundle"
  else
    pass "no reference to the retired ridership client: ${source}"
  fi
done

# --------------------------------------------------------------------------
# 4c. The sample layer
# --------------------------------------------------------------------------
# Real-data plan PR 9 (Architect decisions 2026-11-09, decision 10): every
# surface reads a measured source, the sample layer is deleted, and `status`
# is the only signal a response or the client carries. None of the layer's
# wording may be in a shipped bundle, and none of its identifiers that survive
# a build — object keys, class names, attribute values, the export names the
# bundler keeps as strings. One of them present means a sample label, a sample
# code path or the `isLive` flag came back.
#
# Arguments: the name printed in the result, grep's mode (F fixed string,
# E regex, Ei regex ignoring case) and the pattern. File names are printed on
# failure; file contents never are.
check_absent() {
  local name="$1" mode="$2" pattern="$3" files count first
  case "$mode" in
    F)  files=$(grep -rlF -- "$pattern" "$DIR" 2>/dev/null) ;;
    E)  files=$(grep -rlE -- "$pattern" "$DIR" 2>/dev/null) ;;
    Ei) files=$(grep -rliE -- "$pattern" "$DIR" 2>/dev/null) ;;
    *)  fail "check_absent: unknown mode '${mode}' for ${name}"; return ;;
  esac
  if [ -n "$files" ]; then
    count=$(printf '%s\n' "$files" | wc -l | tr -d ' ')
    first=$(printf '%s\n' "$files" | sort | head -1)
    fail "sample layer: ${name} is in the bundle (${count} file(s), first: ${first#"$DIR"/})"
  else
    pass "no sample layer: ${name}"
  fi
}

# The wording. 「サンプル」 covers 「サンプルデータ」 and 「サンプルデータ（暫定）」; the
# longer one is listed too so a failure names exactly what came back.
check_absent '「サンプルデータ」' F 'サンプルデータ'
check_absent '「サンプル」' F 'サンプル'
check_absent '「固定の参考値」' F '固定の参考値'
check_absent '「Sample data (provisional)」' F 'Sample data (provisional)'
# 「SAMPLE」 as a label: the word on its own — a quoted string, a JSX child,
# text between tags — and not a part of a longer name (the real bundle has
# `sampler`, `sampleCurveX`, `validationSamples`; none of them is a label).
check_absent '「SAMPLE」 as a label' E '(^|[^A-Za-z0-9_])SAMPLE([^A-Za-z0-9_]|$)'

# The deleted identifiers, each as a whole name.
for ident in SampleNote SampleTag SAMPLE_NOTICE SAMPLE_SURFACES SAMPLE_ROWS sampleNotice srcSample; do
  check_absent "the identifier ${ident}" E "(^|[^A-Za-z0-9_\$])${ident}([^A-Za-z0-9_\$]|\$)"
done
# SOURCES.sample: minified, its one use is the read of its label.
check_absent 'the identifier SOURCES.sample (a read of .sample.label)' E '\.sample\.label([^A-Za-z0-9_$]|$)'
# The CSS of the sample note, tag, legend and block.
for class in sample-note sample-tag sample-legend sample-block; do
  check_absent "the class ${class}" F "$class"
done
# The sample group of the footer and of the LP's データ出典 table.
check_absent 'the sample provenance group (data-provenance … sample)' E 'data-provenance.{1,4}sample'
# Decision 10: `isLive` in a response reader, a state or a prop (transportIsLive).
check_absent 'the identifier isLive (any casing, alone or inside a longer name)' Ei 'is_?live'

# --------------------------------------------------------------------------
# 4d. Web fonts: vendored, on this origin, nothing from Google
# --------------------------------------------------------------------------
# Geist, Geist Mono and Noto Sans JP are vendored in the repository
# (public/fonts, scripts/vendor-fonts.mjs): the build fetches nothing from
# Google Fonts, and the browser must not either. A Google Fonts host named
# anywhere in the export means a stylesheet, a preload or a script points a
# visitor's browser at Google again.
for host in fonts.googleapis.com fonts.gstatic.com; do
  files=$(grep -rlF -- "$host" "$DIR" 2>/dev/null)
  if [ -n "$files" ]; then
    count=$(printf '%s\n' "$files" | wc -l | tr -d ' ')
    first=$(printf '%s\n' "$files" | sort | head -1)
    fail "web fonts: ${host} is referenced in the bundle (${count} file(s), first: ${first#"$DIR"/})"
  else
    pass "web fonts: no reference to ${host}"
  fi
done

# The emitted CSS and the preload links point at /fonts/<family>/<name>-<hash>.woff2.
# Each of those files has to be in the bundle: public/ left out of the image,
# or a stylesheet from one vendoring run beside the files of another, would
# otherwise ship pages whose fonts all 404 — and render in the fallback face
# with no error anywhere.
font_refs=$(grep -rhoE '/fonts/[a-z0-9-]+/[a-z0-9-]+-[0-9a-f]{16}\.woff2' "$DIR" 2>/dev/null | sort -u)
if [ -z "$font_refs" ]; then
  fail "web fonts: nothing in the bundle references a vendored font under /fonts/ — the stylesheet is missing"
else
  ref_count=$(printf '%s\n' "$font_refs" | wc -l | tr -d ' ')
  missing=0
  first_missing=""
  while IFS= read -r ref; do
    if [ ! -f "$DIR$ref" ]; then
      missing=$((missing + 1))
      [ -z "$first_missing" ] && first_missing="$ref"
    fi
  done <<FONT_REFS
$font_refs
FONT_REFS
  if [ "$missing" -gt 0 ]; then
    fail "web fonts: ${missing} of ${ref_count} referenced font file(s) are not in the bundle (first: ${first_missing})"
  else
    pass "web fonts: all ${ref_count} referenced font files are in the bundle"
  fi
fi

# --------------------------------------------------------------------------
# 4e. Every file type in the bundle has a stated Content-Type
# --------------------------------------------------------------------------
# backend/core/spa.py serves the bundle with the types in its MEDIA_TYPES
# mapping and nothing else: the production image has no system type table, so
# an extension missing there goes out as application/octet-stream (before the
# mapping existed, fonts went out as text/plain and no check noticed). A new
# file type in the export has to be listed there first.
SPA_PY="${SPA_PY:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/backend/core/spa.py}"
if [ ! -f "$SPA_PY" ]; then
  fail "content types: ${SPA_PY} not found — cannot read the MEDIA_TYPES mapping"
else
  untyped=""
  for ext in $(find "$DIR" -type f -name '*.*' | sed 's/.*\.//' | tr '[:upper:]' '[:lower:]' | sort -u); do
    grep -qF "\".${ext}\": \"" "$SPA_PY" || untyped="${untyped} .${ext}"
  done
  if [ -n "$untyped" ]; then
    fail "content types: the bundle has file type(s) with no entry in MEDIA_TYPES (backend/core/spa.py):${untyped}"
  else
    pass "content types: every file extension in the bundle is in MEDIA_TYPES"
  fi
fi

# --------------------------------------------------------------------------
# 5. The landing page
# --------------------------------------------------------------------------
LP_INDEX="$DIR/index.html"
if [ ! -f "$LP_INDEX" ]; then
  fail "no index.html in $DIR — the landing page is missing from the build"
else
  pass "landing page index.html present"

  if grep -qE '<h1[ >]' "$LP_INDEX" 2>/dev/null; then
    pass "landing page is prerendered (<h1> present in the HTML)"
  else
    fail "no <h1> in the landing page HTML — it is not prerendered, only a client shell"
  fi

  if grep -q '/_next/' "$LP_INDEX" 2>/dev/null; then
    pass "landing page references /_next/ assets"
  else
    fail "landing page has no /_next/ asset — this is not a built Next page"
  fi

  # canonical and og:url outlive the deploy: they are copied into search
  # indexes and chat unfurls, and a wrong origin there is durable.
  for field in 'rel="canonical" href' 'property="og:url" content'; do
    label=${field%% *}
    value=$(grep -oE "${field}=\"[^\"]*\"" "$LP_INDEX" 2>/dev/null | head -1 | sed -E 's/.*="([^"]*)"$/\1/')
    if [ -z "$value" ]; then
      fail "landing page has no ${label} tag"
    elif [ "${value#"$EXPECT_SITE_ORIGIN"}" != "$value" ]; then
      pass "${label} -> ${value}"
    else
      fail "${label} is '${value}', expected it to start with ${EXPECT_SITE_ORIGIN}"
    fi
  done

  # A social card whose image 404s renders blank while the page itself looks
  # perfect, so the file has to exist, not merely be referenced.
  og_image=$(grep -oE 'property="og:image" content="[^"]*"' "$LP_INDEX" 2>/dev/null \
             | head -1 | sed -E 's/.*content="([^"]*)"$/\1/')
  if [ -z "$og_image" ]; then
    fail "landing page has no og:image tag"
  elif [ "${og_image#"$EXPECT_SITE_ORIGIN"}" = "$og_image" ]; then
    fail "og:image '${og_image}' is not on ${EXPECT_SITE_ORIGIN}"
  else
    og_path=${og_image#"$EXPECT_SITE_ORIGIN"}
    og_path=${og_path%%\?*}
    if [ -f "$DIR/${og_path#/}" ]; then
      pass "og:image is same-origin and present in the build (${og_path})"
    else
      fail "og:image points at ${og_path}, which is not in the build output"
    fi
  fi
fi

# --------------------------------------------------------------------------
# 6. The dashboard shell, and THE DISCRIMINATOR
# --------------------------------------------------------------------------
# Landcast could tell its two halves apart by asset prefix (vite /app/assets/
# vs Next /_next/). UrbanOracle is a single Next app, so both pages carry
# /_next/ and that test cannot distinguish them. The structural equivalent is
# the canonical tag: the landing page claims a canonical URL and the
# authenticated shells must not. That makes "the LP was served at /app" a
# detectable fault at the BUNDLE level — the case Parallel City's bundle
# verifier left open and checked only after deploy.
find_html() {
  local base="$1" candidate
  for candidate in "$DIR/${base}.html" "$DIR/${base}/index.html"; do
    [ -f "$candidate" ] && { printf '%s' "$candidate"; return 0; }
  done
  return 1
}

APP_HTML=$(find_html app) || APP_HTML=""
if [ -z "$APP_HTML" ]; then
  fail "dashboard shell missing: neither app.html nor app/index.html is in the build"
else
  pass "dashboard shell present ($(basename "$(dirname "$APP_HTML")")/$(basename "$APP_HTML"))"

  if grep -q '/_next/' "$APP_HTML" 2>/dev/null; then
    pass "dashboard shell references /_next/ assets"
  else
    fail "dashboard shell has no /_next/ asset reference — not a built Next page"
  fi

  if grep -q 'rel="canonical"' "$APP_HTML" 2>/dev/null; then
    fail "/app carries a canonical tag — the landing page is being served at /app"
  else
    pass "/app has no canonical tag (it is the dashboard, not the LP)"
  fi
fi

# /login is public and must likewise not impersonate the landing page.
LOGIN_HTML=$(find_html login) || LOGIN_HTML=""
if [ -z "$LOGIN_HTML" ]; then
  fail "/login page missing from the build — the sign-in route is unreachable"
else
  pass "/login page present"
  if grep -q 'rel="canonical"' "$LOGIN_HTML" 2>/dev/null; then
    fail "/login carries a canonical tag — the landing page is being served at /login"
  else
    pass "/login has no canonical tag"
  fi
fi

# /pending is reached only from a 403; it still has to exist.
if find_html pending >/dev/null; then
  pass "/pending page present"
else
  fail "/pending page missing from the build — a pending user has nowhere to land"
fi

# /auth/action is where the link in the verification mail lands (Stage 2):
# a mail that points at a 404 is a signup that can never complete.
if find_html auth/action >/dev/null; then
  pass "/auth/action page present"
else
  fail "/auth/action page missing from the build — the link in the verification mail has nowhere to land"
fi

# --------------------------------------------------------------------------
# 7. Crawlability — robots / sitemap / 404 agree with the origin
# --------------------------------------------------------------------------
for f in robots.txt sitemap.xml 404.html; do
  if [ -f "$DIR/$f" ]; then
    pass "$f is in the build"
  else
    fail "$f missing from the build"
  fi
done

if [ -f "$DIR/sitemap.xml" ] && grep -qF "$EXPECT_SITE_ORIGIN" "$DIR/sitemap.xml"; then
  pass "sitemap advertises ${EXPECT_SITE_ORIGIN}"
else
  fail "sitemap does not list ${EXPECT_SITE_ORIGIN} — it disagrees with canonical"
fi

if [ -f "$DIR/robots.txt" ] && grep -qF "Sitemap: ${EXPECT_SITE_ORIGIN}/sitemap.xml" "$DIR/robots.txt"; then
  pass "robots.txt points at the sitemap"
else
  fail "robots.txt does not reference ${EXPECT_SITE_ORIGIN}/sitemap.xml"
fi

echo
if [ "$FAILURES" -gt 0 ]; then
  echo "BUNDLE VERIFICATION FAILED ($FAILURES problem(s))" >&2
  exit 1
fi
echo "bundle verification passed"
