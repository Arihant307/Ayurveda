import type { Metadata, Viewport } from "next";
import { bodyFont, devanagariFont, headingFont } from "./fonts";
import { CLINIC, siteUrl } from "@/lib/constants/clinic";
import { RevealObserver } from "@/components/ui/Reveal";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl("/")),
  title: {
    default: "Kumar Ayurveda — Ayurveda & Panchakarma Clinic in Jaipur",
    template: "%s | Kumar Ayurveda, Jaipur",
  },
  description: CLINIC.description,
  applicationName: CLINIC.name,
  formatDetection: { telephone: true, address: true },
  openGraph: { siteName: CLINIC.name, locale: "en_IN", type: "website" },
};

export const viewport: Viewport = {
  themeColor: "#061685",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en-IN"
      className={`${headingFont.variable} ${bodyFont.variable} ${devanagariFont.variable}`}
      suppressHydrationWarning
    >
      <body className="flex min-h-dvh flex-col">
        {children}
        <RevealObserver />
      </body>
    </html>
  );
}
