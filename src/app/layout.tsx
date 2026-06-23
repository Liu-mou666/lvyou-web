import type { Metadata, Viewport } from "next";
import { Noto_Sans_SC } from "next/font/google";
import QueryProvider from "@/components/providers/QueryProvider";
import "./globals.css";

const notoSans = Noto_Sans_SC({
  variable: "--font-noto-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "旅优 · 智能旅游攻略",
  description: "高德 POI + 铁路站码库 + 5A 名录，可溯源的旅行决策参考",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "旅优",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fff9f5" },
    { media: "(prefers-color-scheme: dark)", color: "#fff9f5" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={`${notoSans.variable} h-full`}>
      <body className="min-h-full antialiased text-warm-text">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
