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
# urbanoracle-seven.vercel.app is NOT yet retired as a deployment — it stays
# live as the rollback target until the cutover to the custom domain is
# verified (docs/legacy-excision.md). What is enforced here is narrower and
# true today: the BUILD must not reference it, because sitemap/robots/canonical
# now derive from NEXT_PUBLIC_SITE_URL. At cutover (Stage 6/7) the host is also
# retired at the deployment level, and CUTOVER_RETIRED_HOSTS below folds into
# this list with no change to the check itself.
RETIRED_HOSTS="${RETIRED_HOSTS:-urbanoracle-seven.vercel.app supabase.co}"
# Documented for the cutover step; not separately enforced yet.
CUTOVER_RETIRED_HOSTS="urbanoracle-seven.vercel.app"

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
