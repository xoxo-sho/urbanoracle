import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The build output is a static site that FastAPI serves from STATIC_DIR
  // (backend/core/spa.py, Parallel City type). One origin, so the client can
  // keep calling the relative /api/v1 and no CORS is involved.
  output: "export",

  // A static export has no image-optimisation server.
  images: { unoptimized: true },

  // Dev-only: `next dev` proxies the API to the local FastAPI so the same
  // relative paths work without a container. `rewrites` is ignored by an
  // export build, which is precisely why the client must never bake an
  // absolute origin — verify-bundle asserts it does not.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:8000/api/:path*",
      },
    ];
  },

  // NOTE: the security headers that used to live here (X-Frame-Options,
  // X-Content-Type-Options, Referrer-Policy, Permissions-Policy) cannot be
  // honoured by a static export — the exported HTML is served by FastAPI, not
  // by Next. They are re-emitted in backend/middleware/security_headers.py
  // and verified at post-deploy (Stage 6), not in this bundle.
};

export default nextConfig;
