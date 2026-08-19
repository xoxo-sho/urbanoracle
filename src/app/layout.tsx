import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_JP } from "next/font/google";
import localFont from "next/font/local";
import { AuthProvider } from "@/lib/auth-context";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";
import { FontRuntimeCheck } from "./font-runtime-check";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The body JA face (dxa-ui, 2026-08-19). Until this loader existed the body
// chain was `Geist, "Geist Fallback"` and nothing else — no CJK face, no
// generic family — so every Japanese glyph (621 on the LP) fell through to
// the engine's per-glyph system fallback, silently, and a failed Geist load
// would have left nothing at all after it. Geist stays the Latin face; this
// is what the bridge's --dxa-face-ja points at. preload:false like the other
// JP faces on the platform (many unicode-range slices); display swap.
const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  preload: false,
  display: "swap",
});

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
    "東京23区の地価・人口統計・災害リスク・交通・用途地域などのオープンデータを可視化するWebダッシュボード",
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
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} ${notoSansJP.variable} ${sourceSerif.variable} ${zenOldMincho.variable} antialiased`}
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
