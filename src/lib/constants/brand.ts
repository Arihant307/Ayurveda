/**
 * Clinic logo, cut out (transparent background) from the clinic's own artwork.
 * logo-on-dark.png is the same artwork with the lettering in white, as on the
 * clinic's own dark-background material. width/height are the files' real pixel
 * sizes so the browser reserves the right space (no layout shift).
 */
export const BRAND_LOGO = {
  /** For white / light backgrounds */
  default: { src: "/brand/logo.png", width: 231, height: 143 },
  /** White-text variant for navy backgrounds (footer, admin sidebar) */
  onDark: { src: "/brand/logo-on-dark.png", width: 231, height: 143 },
  alt: "Kumar Ayurveda",
} as const;
