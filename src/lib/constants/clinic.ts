/** Static clinic facts. Opening hours are NOT here — they are derived from doctor schedules. */
export const CLINIC = {
  name: "Kumar Ayurveda",
  tagline: "Ayurveda & Panchakarma Clinic in Jaipur",
  description:
    "Kumar Ayurveda is an Ayurveda and Panchakarma clinic in Vaishali Nagar, Jaipur, offering personalised consultations and traditional therapies.",
  phone: "9610101144",
  phoneDisplay: "+91 96101 01144",
  phoneHref: "tel:+919610101144",
  whatsappHref: "https://wa.me/919610101144",
  email: null as string | null,
  address: {
    street: "S-8, JDA Central Market, Amrapali Circle",
    locality: "Vaishali Nagar",
    city: "Jaipur",
    region: "Rajasthan",
    postalCode: "302021",
    country: "IN",
  },
  /** Approximate coordinates of Amrapali Circle, Vaishali Nagar — confirm with the clinic. */
  geo: { latitude: 26.9118, longitude: 75.7426 },
  social: {
    instagram: "#",
    facebook: "#",
    youtube: "#",
  },
} as const;

export const CLINIC_ADDRESS_LINES = [
  CLINIC.address.street,
  `${CLINIC.address.locality}, ${CLINIC.address.city}, ${CLINIC.address.region} ${CLINIC.address.postalCode}`,
];
export const CLINIC_ADDRESS_ONE_LINE = CLINIC_ADDRESS_LINES.join(", ");

const mapsQuery = encodeURIComponent(`Kumar Ayurveda, ${CLINIC_ADDRESS_ONE_LINE}`);
export const MAPS_EMBED_URL = `https://www.google.com/maps?q=${mapsQuery}&output=embed`;
export const MAPS_DIRECTIONS_URL = `https://www.google.com/maps/dir/?api=1&destination=${mapsQuery}`;

export function siteUrl(path = ""): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path}`;
}
