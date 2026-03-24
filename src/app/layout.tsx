import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "UrbanOracle - 都市データ可視化ダッシュボード",
  description:
    "東京23区の地価・人口統計・災害リスク・交通・用途地域などのオープンデータを可視化するWebダッシュボード",
  keywords: ["都市データ", "東京23区", "地価", "人口統計", "災害リスク", "オープンデータ", "ダッシュボード"],
  openGraph: {
    title: "UrbanOracle - 都市データ可視化ダッシュボード",
    description: "東京23区のオープンデータを地図とチャートで可視化",
    type: "website",
    locale: "ja_JP",
    siteName: "UrbanOracle",
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
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      suppressHydrationWarning
    >
      <body className="bg-background text-foreground">{children}</body>
    </html>
  );
}
