import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { SITE_URL } from "@/lib/config";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Meklit Jobs: jobs in Ethiopia that fit you", template: "%s · Meklit Jobs" },
  description:
    "New jobs from Ethiopia's job channels and websites, matched to your profession and sent to you on Telegram.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fdfdfd",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geistSans.variable}>
      <body className="min-h-dvh bg-bg font-sans text-text antialiased">{children}</body>
    </html>
  );
}
