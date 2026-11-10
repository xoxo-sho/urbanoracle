import type { Metadata } from "next";
import localFont from "next/font/local";
import { preload } from "react-dom";
import { AuthProvider } from "@/lib/auth-context";
import { SITE_NAME, SITE_URL } from "@/lib/site";
// Geist (Latin), Geist Mono (mono) and Noto Sans JP (the body JA face the
// dxa-ui bridge points --dxa-face-ja at) are vendored in the repository:
// public/fonts/<family>/, written by scripts/vendor-fonts.mjs. Neither the
// build nor the browser contacts Google. styles/fonts.css holds one
// @font-face per Google slice (unicode-range and all), the size-adjusted
// "<family> Fallback" faces and --font-geist-sans / --font-geist-mono /
// --font-noto-sans-jp on :root — the rules, files and variables
// next/font/google produced here until 2026-11 (docs/vendored-fonts.md).
// Imported before globals.css, the order next/font's stylesheets had.
import "../../styles/fonts.css";
import "./globals.css";
import { FontRuntimeCheck } from "./font-runtime-check";
import { PRELOAD_FONTS } from "./vendored-fonts";

// Heading faces (spec §3), self-hosted as heading-only subsets so the payload
// is bounded and reproducible. Both are display: swap — a heading face must
// never block first paint.
//
// 欧文 leads the stack and 和文 follows, so Latin in a mixed heading is set in
// Source Serif and every Japanese glyph falls through to Zen Old Mincho.
const sourceSerif = localFont({
  src: "./fonts/SourceSerif4-700-subset.woff2",
  variable: "--font-source-serif",
  weight: "700",
  display: "swap",
});

const zenOldMincho = localFont({
  src: "./fonts/ZenOldMincho-700-subset.woff2",
  variable: "--font-zen-old-mincho",
  weight: "700",
  display: "swap",
});

export const metadata: Metadata = {
  // Every absolute URL in the document derives from here.
  metadataBase: new URL(SITE_URL),
  title: "UrbanOracle - 都市データ可視化ダッシュボード",
  description:
    "東京23区の地価・人口統計・災害リスク・交通などのオープンデータを可視化するWebダッシュボード",
  keywords: ["都市データ", "東京23区", "地価", "人口統計", "災害リスク", "オープンデータ", "ダッシュボード"],
  openGraph: {
    title: "UrbanOracle - 都市データ可視化ダッシュボード",
    description: "東京23区のオープンデータを地図とチャートで可視化",
    type: "website",
    locale: "ja_JP",
    siteName: SITE_NAME,
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "UrbanOracle",
    description: "東京23区の都市データ可視化ダッシュボード",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The latin file of Geist and of Geist Mono, as next/font/google preloaded
  // them. Noto Sans JP is not preloaded: 124 unicode-range slices, each
  // fetched only when a page shows a character in it (display: swap).
  for (const href of PRELOAD_FONTS) {
    preload(href, { as: "font", type: "font/woff2", crossOrigin: "" });
  }
  return (
    <html
      lang="ja"
      className={`${sourceSerif.variable} ${zenOldMincho.variable} antialiased`}
      suppressHydrationWarning
    >
      <body className="bg-background text-foreground">
        {/* dxa-ui check 3 — runtime font assertion. Sibling of AuthProvider, not
            inside it: it must run on every route and has nothing to do with the
            auth seam (api-gate / auth-context untouched). Renders nothing. */}
        <FontRuntimeCheck />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
