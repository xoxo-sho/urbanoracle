#!/usr/bin/env bash
# Guard (iii): the production build, in a container with no network.
#
#   scripts/build-offline.sh
#
# Runs `npm run build` (a clean one: .next/ and out/ are removed first) inside
# the image the Dockerfile builds the front-end in, started with
# `--network none`: no interface but loopback, so no DNS and no route to any
# host. A build that fetches anything — a next/font/google stylesheet, a font
# file, a next/og fallback font — cannot get it.
#
# Why a container and not a Node preload that blocks sockets (Parallel City's
# scripts/no-network-guard.cjs): this product builds with Turbopack, which
# fetches next/font/google from native code a Node preload never sees.
#
# Three things make the run fail:
#   1. the container can reach a Google Fonts host after all (the proof would
#      be vacuous);
#   2. `npm run build` fails (next/font/google does, without the network);
#   3. the build log has next/og's "Failed to load dynamic font": next/og
#      swallows that error and draws the OG card without the glyphs, so the
#      build would otherwise pass with a blank card.
#
# node_modules must already be installed for linux (CI: `npm ci` on the
# runner, same OS and libc as the image). On macOS the host's node_modules are
# darwin binaries; install a linux copy into a volume once, with the network,
# and name it:
#
#   docker run --rm -v "$PWD/package.json:/build/package.json:ro" \
#     -v "$PWD/package-lock.json:/build/package-lock.json:ro" \
#     -v uo-offline-deps:/build/node_modules -w /build node:20-slim npm ci
#   OFFLINE_BUILD_DEPS_VOLUME=uo-offline-deps scripts/build-offline.sh
#
# Environment:
#   OFFLINE_BUILD_IMAGE        default node:20-slim (Dockerfile, stage 1)
#   OFFLINE_BUILD_DEPS_VOLUME  a docker volume to mount over node_modules
#   NEXT_PUBLIC_*              passed through to the build, as in the Dockerfile

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="${OFFLINE_BUILD_IMAGE:-node:20-slim}"
LOG="$(mktemp)"
trap 'rm -f "$LOG"' EXIT

# The image is pulled here, with the network; the build below has none.
docker image inspect "$IMAGE" >/dev/null 2>&1 || docker pull "$IMAGE"

args=(run --rm --network none --user "$(id -u):$(id -g)" -e HOME=/tmp -e CI=true -e NEXT_TELEMETRY_DISABLED=1)
while IFS='=' read -r name _; do
  case "$name" in NEXT_PUBLIC_*) args+=(-e "$name") ;; esac
done < <(env)
args+=(-v "$ROOT:/build" -w /build)
if [ -n "${OFFLINE_BUILD_DEPS_VOLUME:-}" ]; then
  args+=(-v "${OFFLINE_BUILD_DEPS_VOLUME}:/build/node_modules:ro")
fi

# Runs inside the container.
read -r -d '' INSIDE <<'EOF' || true
set -eu
node -e '
  const hosts = ["https://fonts.googleapis.com/css2?family=Geist", "https://fonts.gstatic.com/"];
  Promise.all(hosts.map((u) => fetch(u, { signal: AbortSignal.timeout(10000) }).then(() => u, () => null))).then((reached) => {
    const up = reached.filter(Boolean);
    if (up.length) { console.error("build-offline: FAIL — this container can reach " + up.join(", ") + "; the offline build would prove nothing"); process.exit(1); }
    console.log("build-offline: no network in this container (fonts.googleapis.com and fonts.gstatic.com are unreachable)");
  });
'
rm -rf .next out
npm run build
EOF

echo "build-offline: ${IMAGE}, --network none"
set +e
docker "${args[@]}" "$IMAGE" sh -c "$INSIDE" 2>&1 | tee "$LOG"
status=${PIPESTATUS[0]}
set -e

if [ "$status" -ne 0 ]; then
  echo "build-offline: FAIL — the production build does not succeed without the network (exit ${status})" >&2
  exit 1
fi
if grep -q "Failed to load dynamic font" "$LOG"; then
  echo "build-offline: FAIL — next/og tried to fetch a font for the OG card and drew it without the glyphs" >&2
  echo "               (re-run scripts/vendor-fonts.mjs after changing src/app/opengraph-image.tsx)" >&2
  exit 1
fi
if [ ! -f "$ROOT/out/index.html" ] || [ ! -f "$ROOT/out/opengraph-image" ]; then
  echo "build-offline: FAIL — the build reported success but out/index.html or out/opengraph-image is missing" >&2
  exit 1
fi
echo "build-offline: ok — the production build succeeded with no network"
