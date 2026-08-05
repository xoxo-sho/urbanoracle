import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Metadata routes must be explicitly static under output:"export" —
// otherwise the build cannot know they are computable ahead of time.
export const dynamic = "force-static";


/**
 * Generated rather than served from public/, so the sitemap URL follows
 * NEXT_PUBLIC_SITE_URL instead of being frozen at whatever host was current
 * when the file was written. (The static public/robots.txt it replaces still
 * pointed at the Vercel origin.)
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Authenticated surfaces: nothing for a crawler to index.
      disallow: ["/api/", "/app", "/pending"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
