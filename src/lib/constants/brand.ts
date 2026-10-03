/**
 * Logo files. Replace the files in /public/brand with the clinic's real logo
 * (transparent PNG or SVG) keeping these names — or update the paths here.
 * Keep width/height at the logo's real aspect ratio to avoid layout shift.
 */
export const BRAND_LOGO = {
  /** For white / light backgrounds */
  default: { src: "/brand/logo.svg", width: 220, height: 64 },
  /** White-text variant for navy backgrounds (footer, admin sidebar) */
  onDark: { src: "/brand/logo-on-dark.svg", width: 220, height: 64 },
  alt: "Kumar Ayurveda",
} as const;
