import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_JP } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/layout/AppShell";

const plex = IBM_Plex_Sans_JP({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-plex",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "家計の締め",
  description: "月末の予算配分と、資産・損益の振り返り",
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
    shortcut: "/icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "家計",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F4F3EF",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={plex.variable}>
      <body className="font-sans text-ink antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
