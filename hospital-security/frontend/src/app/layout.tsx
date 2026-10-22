import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CareShield SOC — Hospital Security Operations",
  description: "Phishing, URL, network-intrusion and endpoint threat detection for healthcare.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
