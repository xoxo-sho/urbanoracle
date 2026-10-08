import LandingContent from "@/components/landing/LandingContent";
import { LanguageProvider } from "@/i18n/lang-context";
import { LP_COPY } from "@/i18n/lp";

/**
 * Landing page (design-spec-v1 §4).
 *
 * A server component: it owns the route's exported metadata, which stays
 * Japanese — a static export bakes it into the HTML, so it cannot follow a
 * language chosen in the browser (the client swaps <title> and the meta
 * description; og:* and twitter:* stay as built). The body is
 * components/landing/LandingContent.tsx, rendered in the visitor's language
 * under LanguageProvider (src/i18n/lang-context.tsx); its first render is
 * Japanese, matching the prerendered HTML.
 */

export const metadata = {
  title: LP_COPY.ja.metaTitle,
  description: LP_COPY.ja.metaDescription,
  // The landing page is the ONLY page that claims a canonical URL. That is
  // what lets verify-bundle tell the LP from the dashboard shell in a
  // single-Next build where both sides share /_next/ assets.
  alternates: { canonical: "/" },
};

export default function LandingPage() {
  return (
    <LanguageProvider>
      <LandingContent />
    </LanguageProvider>
  );
}
