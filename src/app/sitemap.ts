import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Metadata routes must be explicitly static under output:"export" —
// otherwise the build cannot know they are computable ahead of time.
export const dynamic = "force-static";


/**
 * Only publicly reachable pages belong here. /app and /pending sit behind
 * authentication, so advertising them to a crawler would list URLs that
 * answer with a sign-in screen.
 *
 * lastModified is deliberately absent: deriving it from build time would make
 * the sitemap differ between two builds of identical content.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/login`, changeFrequency: "monthly", priority: 0.3 },
  ];
}
