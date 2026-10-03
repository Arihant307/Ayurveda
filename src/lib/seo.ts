import type { Metadata } from "next";
import type { Doctor, Treatment } from "@prisma/client";
import { CLINIC, siteUrl } from "@/lib/constants/clinic";

export function pageMetadata({
  title,
  description,
  path,
  image,
  noIndex,
}: {
  title: string;
  description: string;
  path: string;
  image?: string | null;
  noIndex?: boolean;
}): Metadata {
  const url = siteUrl(path);
  const images = image && !image.endsWith(".svg") ? [{ url: image.startsWith("http") ? image : siteUrl(image) }] : undefined;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: CLINIC.name,
      locale: "en_IN",
      url,
      title,
      description,
      ...(images ? { images } : {}),
    },
    twitter: { card: "summary_large_image", title, description },
    ...(noIndex ? { robots: { index: false, follow: false } } : {}),
  };
}

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function clinicJsonLd(sessions: { weekday: number; startTime: string; endTime: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "MedicalClinic",
    "@id": siteUrl("/#clinic"),
    name: CLINIC.name,
    description: CLINIC.description,
    url: siteUrl("/"),
    telephone: `+91${CLINIC.phone}`,
    image: siteUrl("/opengraph-image"),
    logo: siteUrl("/brand/logo.svg"),
    priceRange: "₹₹",
    medicalSpecialty: ["Ayurveda", "Panchakarma"],
    address: {
      "@type": "PostalAddress",
      streetAddress: CLINIC.address.street,
      addressLocality: `${CLINIC.address.locality}, ${CLINIC.address.city}`,
      addressRegion: CLINIC.address.region,
      postalCode: CLINIC.address.postalCode,
      addressCountry: CLINIC.address.country,
    },
    geo: { "@type": "GeoCoordinates", latitude: CLINIC.geo.latitude, longitude: CLINIC.geo.longitude },
    openingHoursSpecification: sessions.map((s) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: `https://schema.org/${dayNames[s.weekday]}`,
      opens: s.startTime,
      closes: s.endTime,
    })),
    areaServed: { "@type": "City", name: "Jaipur" },
  };
}

export function physicianJsonLd(doctor: Pick<Doctor, "slug" | "name" | "qualification" | "specialization" | "bio" | "photoUrl">) {
  return {
    "@context": "https://schema.org",
    "@type": "Physician",
    "@id": siteUrl(`/doctors/${doctor.slug}#physician`),
    name: doctor.name,
    url: siteUrl(`/doctors/${doctor.slug}`),
    ...(doctor.bio ? { description: doctor.bio } : {}),
    ...(doctor.qualification ? { hasCredential: doctor.qualification } : {}),
    ...(doctor.photoUrl ? { image: siteUrl(doctor.photoUrl) } : {}),
    medicalSpecialty: "Ayurveda",
    telephone: `+91${CLINIC.phone}`,
    worksFor: { "@id": siteUrl("/#clinic") },
    address: {
      "@type": "PostalAddress",
      streetAddress: CLINIC.address.street,
      addressLocality: `${CLINIC.address.locality}, ${CLINIC.address.city}`,
      addressRegion: CLINIC.address.region,
      postalCode: CLINIC.address.postalCode,
      addressCountry: CLINIC.address.country,
    },
  };
}

export function therapyJsonLd(t: Pick<Treatment, "slug" | "name" | "shortDescription" | "imageUrl">) {
  return {
    "@context": "https://schema.org",
    "@type": "MedicalTherapy",
    "@id": siteUrl(`/treatments/${t.slug}#therapy`),
    name: t.name,
    description: t.shortDescription,
    url: siteUrl(`/treatments/${t.slug}`),
    ...(t.imageUrl ? { image: siteUrl(t.imageUrl) } : {}),
    relevantSpecialty: "Ayurveda",
    provider: { "@id": siteUrl("/#clinic") },
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: siteUrl(item.path),
    })),
  };
}
