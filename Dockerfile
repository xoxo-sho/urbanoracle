# Single-service image: FastAPI serves the API and the whole front-end from
# one origin.
#
#   /            → landing page (Next static export)
#   /login, /pending, /forgot-password → public shells
#   /app         → dashboard shell
#   /api/v1/*    → API
#
# Build context is the repository root — it needs src/ (front-end) AND
# backend/.
#
#   docker build --platform linux/amd64 \
#     --build-arg NEXT_PUBLIC_FIREBASE_API_KEY=... \
#     --build-arg NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=dxalabs-platform.firebaseapp.com \
#     --build-arg NEXT_PUBLIC_FIREBASE_PROJECT_ID=dxalabs-platform \
#     --build-arg NEXT_PUBLIC_FIREBASE_APP_ID=1:<number>:web:<hex> \
#     -t urbanoracle .
#
# --platform linux/amd64 matters on Apple Silicon. Cloud Run runs amd64 and
# Cloud Build produces amd64, so an arm64 local image is not the artifact that
# ships. It also does not work: the arm64 cryptography wheel (a pyjwt[crypto]
# dependency) dies with SIGILL the moment `import jwt` loads its Rust bindings,
# taking the container down at startup (observed on Landcast).
#
# DELIBERATELY ABSENT vs the Parallel City image, because UrbanOracle has no
# ML, PDF or 3D capability: libgomp1 (LightGBM's OpenMP runtime), joblib model
# artifacts, reportlab, bundled CJK fonts, and Cesium static assets. These are
# omitted on purpose, not overlooked — an image should not carry a runtime
# surface nothing exercises.
#
# The API base URL needs no build arg: the client calls the same-origin
# relative /api/v1 (src/lib/api-gate.ts), which verify-bundle enforces.

# ── Stage 1: front-end build (Next.js static export) ────────────────────────
FROM node:20-slim AS frontend-build

WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json next.config.ts postcss.config.mjs eslint.config.mjs ./
COPY public ./public
# Includes src/app/fonts/*.woff2 — the Zen Old Mincho and Source Serif 4
# heading subsets are committed, so the image needs no font download.
COPY src ./src

# Client-side Firebase config, inlined into the bundle at compile time. These
# are public identifiers, not secrets: access is decided server-side by RS256
# verification plus the curated is_active gate. They are build args rather
# than runtime env because Next inlines NEXT_PUBLIC_* during the build.
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
# appId identifies WHICH web app in the shared dxalabs-platform project this
# bundle belongs to — the only config field that differs between products.
ARG NEXT_PUBLIC_FIREBASE_APP_ID
# The origin the landing page's canonical/OG/sitemap will claim. verify-bundle
# asserts the built tags match it.
ARG NEXT_PUBLIC_SITE_URL=https://urbanoracle.dxalabs.com
# Shown on /login (Parallel City precedent); the image tag is the git sha.
ARG NEXT_PUBLIC_BUILD_SHA=dev

ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_BUILD_SHA=$NEXT_PUBLIC_BUILD_SHA

RUN npm run build

# ── Stage 2: Python dependencies ────────────────────────────────────────────
FROM python:3.11-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir --retries 5 --timeout 120 -r requirements.txt

# ── Stage 3: runtime ────────────────────────────────────────────────────────
# python:3.11-slim, matching the 3.11 the CI backend job runs. A 3.10 runtime
# against 3.11 CI is exactly the environment difference that only shows up in
# production.
FROM python:3.11-slim

# curl is for the healthcheck. Nothing else is installed: no libgomp1, because
# there is no LightGBM; no font packages, because there is no PDF.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home appuser
WORKDIR /app

COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

COPY backend/ ./

# The built site, served by FastAPI from STATIC_DIR (backend/core/spa.py).
COPY --from=frontend-build /build/out ./static

ENV PYTHONUNBUFFERED=1
ENV STATIC_DIR=/app/static

USER appuser
EXPOSE 8080

# /api/v1/health is the only unauthenticated route — this probe (and Cloud
# Run's) must work without a user token.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:8080/api/v1/health || exit 1

# Honour the $PORT Cloud Run injects; default to 8080 locally.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"]
