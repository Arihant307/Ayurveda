import localFont from "next/font/local";

/** Self-hosted fonts (files live next to this module). */
export const headingFont = localFont({
  src: [
    { path: "./cormorant-garamond-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./cormorant-garamond-latin-500-italic.woff2", weight: "500", style: "italic" },
    { path: "./cormorant-garamond-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./cormorant-garamond-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-heading",
  display: "swap",
  fallback: ["Georgia", "Times New Roman", "serif"],
});

export const bodyFont = localFont({
  src: [
    { path: "./source-sans-3-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./source-sans-3-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./source-sans-3-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-body",
  display: "swap",
  fallback: ["system-ui", "Segoe UI", "Arial", "sans-serif"],
});

export const devanagariFont = localFont({
  src: [
    { path: "./mukta-devanagari-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./mukta-devanagari-600-normal.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-devanagari",
  display: "swap",
  preload: false,
  fallback: ["Noto Sans Devanagari", "sans-serif"],
});
