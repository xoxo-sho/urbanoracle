import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import { AuthProvider } from "@/lib/auth-context";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
      className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif.variable} ${zenOldMincho.variable} antialiased`}
      suppressHydrationWarning
    >
      <body className="bg-background text-foreground">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
