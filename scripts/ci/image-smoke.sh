#!/usr/bin/env bash
# Image smoke gate (ci.yml, job "image"): boots a BUILT production image and
# checks what only the image can show. Runs the same way in CI and locally;
# needs docker, curl and bash on PATH.
#
#   usage: image-smoke.sh <step> <image>
#
#   user      the image's configured user is not root, and `id -u` in a
#             container of it is not 0
#   bundle    scripts/verify-bundle.sh on /app/static copied out of the image
#             (what Cloud Build's second step does), structural mode
#   boot      a throwaway postgres:16, `alembic upgrade head` through the
#             image's own code, then the app with no production secrets:
#               - /api/v1/health 200 {"status":"ok"}
#               - / 200 text/html with exactly one <h1>
#               - one .woff2 from each folder under /fonts, each named by the
#                 emitted CSS: 200, font/woff2, starts with wOF2
#               - /data/tokyo-wards.geojson 200 application/geo+json
#               - every GET route under /api/v1 except /health — the list is
#                 read from the app inside the image, never hardcoded — answers
#                 401 without a token (at least 7 routes, so an empty list
#                 cannot pass)
#               - HEAD answers wherever GET does (follow-up 2): /, /login and
#                 /app 200 text/html with GET's Content-Length, one font 200
#                 font/woff2, /api/v1/health 200, and every one of those data
#                 routes 401 to HEAD without a token
#               - the log has no ERROR or Traceback line
#   snapshot  the image refuses to start when a committed snapshot is missing:
#             STATIONS_PATH pointed at a file that does not exist — the
#             container must exit non-zero, name the snapshot, and never
#             answer /api/v1/health
#   all       the four, in that order
#
# Each failure prints one line "SMOKE FAIL [<step>]: <reason>" and exits 1.
# Every container this script starts is removed on exit.
#
# Why this exists: PR CI built and tested the source, never the image. The
# image differs from the runner in ways the source cannot show — what the
# Dockerfile copies, and python:3.11-slim having no system MIME table, where
# every font went out as text/plain while the test suite passed (found by hand
# before PR 27 merged, 2026-11-10). Shape and conventions follow Parti's
# scripts/ci/image-smoke.sh (xoxo-sho/parti at 9ee003f).
set -euo pipefail

step="${1:?usage: image-smoke.sh <user|bundle|boot|snapshot|all> <image>}"
image="${2:?usage: image-smoke.sh <step> <image>}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
PLATFORM="${SMOKE_PLATFORM:-linux/amd64}"
POSTGRES_IMAGE="${SMOKE_POSTGRES_IMAGE:-postgres:16}"
PORT="${SMOKE_PORT:-18080}"
URL="http://127.0.0.1:$PORT"
# The app joins the database container's network, so the database is on
# 127.0.0.1 for it and the app's port is published by the database container.
DB_URL="postgresql+psycopg://urbanoracle:smoke@127.0.0.1:5432/urbanoracle_smoke"
tag="uo-smoke-$$"
tmp="$(mktemp -d)"

cleanup() {
  docker rm -f "$tag-db" "$tag-app" "$tag-snap" "$tag-user" > /dev/null 2>&1 || true
  rm -rf -- "$tmp"
}
trap cleanup EXIT

current=""
fail() { echo "SMOKE FAIL [$current]: $*"; exit 1; }
pass() { echo "SMOKE PASS [$current]: $*"; }
run() { docker run --platform "$PLATFORM" "$@"; }
# status and content type of a GET, body in $tmp/body
get() { curl -s -o "$tmp/body" -w '%{http_code} %{content_type}' --max-time 20 "$URL$1" || true; }
# status and content type of a HEAD (curl -I), headers in $tmp/head
head_req() { curl -s -I -o "$tmp/head" -w '%{http_code} %{content_type}' --max-time 20 "$URL$1" || true; }
# a header's value from $tmp/head (case-insensitive name)
header() { tr -d '\r' < "$tmp/head" | awk -v k="$(tr '[:upper:]' '[:lower:]' <<<"$1")" -F': ' 'tolower($1) == k { print $2 }'; }

step_user() {
  current=user
  local configured uid
  configured="$(docker image inspect "$image" --format '{{.Config.User}}')" || fail "cannot inspect $image"
  case "$configured" in
    ""|root|0|0:*|root:*) fail "the image's configured user is '${configured:-<empty, so root>}'" ;;
  esac
  uid="$(run --rm --name "$tag-user" --entrypoint id "$image" -u 2>&1)" || fail "id -u failed in the image: $uid"
  [[ $uid =~ ^[0-9]+$ && $uid -ne 0 ]] || fail "a container of the image runs as uid '$uid'"
  pass "runs as '$configured' (uid $uid), not root"
}

step_bundle() {
  current=bundle
  local cid out
  cid="$(docker create --platform "$PLATFORM" "$image")" || fail "cannot create a container from $image"
  docker cp "$cid":/app/static "$tmp/bundle" > /dev/null 2>&1 || { docker rm -f "$cid" > /dev/null; fail "the image has no /app/static — the front-end build is not in it"; }
  docker rm -f "$cid" > /dev/null
  out="$(SKIP_REAL_CONFIG="${SKIP_REAL_CONFIG:-1}" bash "$root/scripts/verify-bundle.sh" "$tmp/bundle" 2>&1)" \
    || fail "verify-bundle on the image's /app/static: $(grep -E '^  FAIL ' <<<"$out" | head -3 | tr '\n' ';')"
  pass "verify-bundle passes on /app/static ($(find "$tmp/bundle" -type f | wc -l | tr -d ' ') files)"
}

# A throwaway Postgres named $tag-db, migrated through the image's own code.
start_db() {
  local out
  docker run -d --name "$tag-db" -p "127.0.0.1:$PORT:8080" \
    -e POSTGRES_USER=urbanoracle -e POSTGRES_PASSWORD=smoke -e POSTGRES_DB=urbanoracle_smoke \
    "$POSTGRES_IMAGE" > /dev/null || fail "cannot start $POSTGRES_IMAGE"
  for _ in $(seq 1 60); do
    docker exec "$tag-db" pg_isready -U urbanoracle -d urbanoracle_smoke -h 127.0.0.1 > /dev/null 2>&1 && break
    sleep 1
  done
  docker exec "$tag-db" pg_isready -U urbanoracle -d urbanoracle_smoke -h 127.0.0.1 > /dev/null 2>&1 \
    || fail "the database did not become ready in 60 s"
  out="$(run --rm --network "container:$tag-db" -e DATABASE_URL="$DB_URL" "$image" python -m alembic upgrade head 2>&1)" \
    || fail "alembic upgrade head failed in the image: $(tail -2 <<<"$out" | tr '\n' ' ')"
}

step_boot() {
  current=boot
  local out code n routes route fonts font dir page length checked=0
  start_db
  # As deploy.yml starts it, minus the three secrets: no ESTAT_API_KEY, no
  # RESEND_API_KEY, and a database that is not production's.
  run -d --name "$tag-app" --network "container:$tag-db" \
    -e DATABASE_URL="$DB_URL" -e ENVIRONMENT=production -e GIP_PROJECT_ID=dxalabs-platform \
    "$image" > /dev/null || fail "cannot start the image"
  for _ in $(seq 1 90); do
    [[ "$(docker inspect -f '{{.State.Running}}' "$tag-app" 2>/dev/null)" == true ]] \
      || fail "the container exited before serving (exit $(docker inspect -f '{{.State.ExitCode}}' "$tag-app")): $(docker logs "$tag-app" 2>&1 | grep -v '^ *$' | tail -1)"
    [[ "$(get /api/v1/health)" == 200* ]] && break
    sleep 1
  done

  out="$(get /api/v1/health)"
  [[ $out == 200* ]] || fail "/api/v1/health answered '$out' after 90 s"
  grep -q '"status":"ok"' "$tmp/body" || fail "/api/v1/health body is not {\"status\":\"ok\"}"

  out="$(get /)"
  [[ $out == "200 text/html"* ]] || fail "/ answered '$out', expected 200 text/html"
  n="$(grep -o '<h1' "$tmp/body" | wc -l | tr -d ' ')"
  [[ $n -eq 1 ]] || fail "/ has $n <h1> elements, expected exactly 1 (the landing page is not prerendered)"
  cp "$tmp/body" "$tmp/lp.html"

  # One font per folder under /fonts, taken from the image and required to be
  # named by the CSS the landing page loads.
  fonts="$(docker exec "$tag-app" sh -c 'for d in /app/static/fonts/*/; do ls "$d" | grep "\.woff2$" | sort | head -1 | sed "s#^#/fonts/$(basename "$d")/#"; done' 2>/dev/null)" || true
  [[ -n $fonts ]] || fail "the image has no .woff2 under /app/static/fonts — public/fonts is not in the bundle"
  docker exec "$tag-app" sh -c 'cat /app/static/_next/static/chunks/*.css' > "$tmp/all.css" 2>/dev/null || true
  for font in $fonts; do
    grep -qF "$font" "$tmp/all.css" || fail "$font is in the image but no emitted stylesheet names it"
    out="$(get "$font")"
    [[ $out == "200 font/woff2" ]] || fail "$font answered '$out', expected '200 font/woff2'"
    [[ "$(head -c 4 "$tmp/body")" == wOF2 ]] || fail "$font is not a woff2 file"
    checked=$((checked + 1))
  done
  [[ $checked -ge 3 ]] || fail "only $checked font folder(s) under /fonts, expected 3 (geist, geist-mono, noto-sans-jp)"

  out="$(get /data/tokyo-wards.geojson)"
  [[ $out == "200 application/geo+json" ]] || fail "/data/tokyo-wards.geojson answered '$out', expected '200 application/geo+json'"

  # The route list comes from the app in the image.
  routes="$(docker exec -w /app "$tag-app" python -c '
from main import app
for r in app.routes:
    p = getattr(r, "path", ""); m = getattr(r, "methods", None) or ()
    if p.startswith("/api/v1/") and p != "/api/v1/health" and "GET" in m and "{" not in p:
        print(p)
' 2>&1)" || fail "cannot list the routes of the app in the image: $(tail -1 <<<"$routes")"
  n="$(grep -c '^/api/v1/' <<<"$routes" || true)"
  [[ $n -ge 7 ]] || fail "found $n GET route(s) under /api/v1 besides /health, expected at least 7"
  for route in $routes; do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$URL$route" || true)"
    [[ $code == 401 ]] || fail "$route answered $code without a token, expected 401"
  done

  # HEAD answers wherever GET does, with GET's status and headers (follow-up 2:
  # every route was GET-only and HEAD /login answered 405 in production).
  for page in / /login /app; do
    out="$(get "$page")"
    [[ $out == "200 text/html"* ]] || fail "GET $page answered '$out', expected 200 text/html"
    length="$(wc -c < "$tmp/body" | tr -d ' ')"
    out="$(head_req "$page")"
    [[ $out == "200 text/html"* ]] || fail "HEAD $page answered '$out', expected 200 text/html"
    [[ "$(header content-length)" == "$length" ]] || fail "HEAD $page says Content-Length '$(header content-length)', GET sent $length bytes"
  done
  font="$(head -1 <<<"$fonts")"
  out="$(head_req "$font")"
  [[ $out == "200 font/woff2" ]] || fail "HEAD $font answered '$out', expected '200 font/woff2'"
  out="$(head_req /api/v1/health)"
  [[ $out == 200* ]] || fail "HEAD /api/v1/health answered '$out', expected 200"
  for route in $routes; do
    out="$(head_req "$route")"
    [[ $out == 401* ]] || fail "HEAD $route answered '$out' without a token, expected 401"
  done

  out="$(docker logs "$tag-app" 2>&1 | grep -E 'ERROR|Traceback' | head -2 || true)"
  [[ -z $out ]] || fail "the log has error lines: $out"
  pass "health 200; / 200 with one <h1>; $checked fonts 200 font/woff2; geojson application/geo+json; $n data routes 401 without a token; HEAD / /login /app 200 with GET's length, font and health 200, $n data routes 401; clean log"
  docker rm -f "$tag-app" "$tag-db" > /dev/null 2>&1 || true
}

step_snapshot() {
  current=snapshot
  local code logs waited=0
  start_db
  run -d --name "$tag-snap" --network "container:$tag-db" \
    -e DATABASE_URL="$DB_URL" -e ENVIRONMENT=production -e GIP_PROJECT_ID=dxalabs-platform \
    -e STATIONS_PATH=/app/data/no-such-snapshot.json \
    "$image" > /dev/null || fail "cannot start the image"
  while [[ "$(docker inspect -f '{{.State.Running}}' "$tag-snap" 2>/dev/null)" == true ]]; do
    [[ "$(get /api/v1/health)" == 200* ]] && fail "the image serves (/api/v1/health 200) with the stations snapshot missing"
    waited=$((waited + 1))
    [[ $waited -lt 60 ]] || fail "the container was still running after 60 s with the stations snapshot missing"
    sleep 1
  done
  code="$(docker inspect -f '{{.State.ExitCode}}' "$tag-snap")"
  logs="$(docker logs "$tag-snap" 2>&1)"
  [[ $code -ne 0 ]] || fail "the container exited 0 with the stations snapshot missing"
  grep -q 'stations snapshot unusable — refusing to start' <<<"$logs" \
    || fail "the container exited $code but its log does not name the stations snapshot: $(grep -v '^ *$' <<<"$logs" | tail -1)"
  pass "with STATIONS_PATH at a missing file the container exits $code and says 'stations snapshot unusable — refusing to start'"
  docker rm -f "$tag-snap" "$tag-db" > /dev/null 2>&1 || true
}

case "$step" in
  user) step_user ;;
  bundle) step_bundle ;;
  boot) step_boot ;;
  snapshot) step_snapshot ;;
  all) step_user; step_bundle; step_boot; step_snapshot ;;
  *) echo "unknown step '$step' (user|bundle|boot|snapshot|all)"; exit 2 ;;
esac
