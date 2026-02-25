import type { Metadata, Viewport } from "next";
import "./globals.css";
import ClientLayout from "@/components/layout/ClientLayout";

export const metadata: Metadata = {
  title: "家計 Analytics",
  description: "Strategic Household Finance Management",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-slate-950">
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
