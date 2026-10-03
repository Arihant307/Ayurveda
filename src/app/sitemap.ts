import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { siteUrl } from "@/lib/constants/clinic";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [doctors, treatments] = await Promise.all([
    db.doctor.findMany({ where: { isActive: true }, select: { slug: true, updatedAt: true } }),
    db.treatment.findMany({ where: { isVisible: true }, select: { slug: true, updatedAt: true } }),
  ]);
  const staticPages: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
    { path: "/", priority: 1, changeFrequency: "weekly" },
    { path: "/book", priority: 0.9, changeFrequency: "weekly" },
    { path: "/panchakarma", priority: 0.9, changeFrequency: "monthly" },
    { path: "/treatments", priority: 0.8, changeFrequency: "monthly" },
    { path: "/doctors", priority: 0.8, changeFrequency: "monthly" },
    { path: "/about", priority: 0.6, changeFrequency: "yearly" },
    { path: "/contact", priority: 0.7, changeFrequency: "yearly" },
    { path: "/privacy", priority: 0.2, changeFrequency: "yearly" },
    { path: "/terms", priority: 0.2, changeFrequency: "yearly" },
    { path: "/disclaimer", priority: 0.2, changeFrequency: "yearly" },
  ];
  return [
    ...staticPages.map((p) => ({ url: siteUrl(p.path), priority: p.priority, changeFrequency: p.changeFrequency })),
    ...doctors.map((d) => ({ url: siteUrl(`/doctors/${d.slug}`), lastModified: d.updatedAt, priority: 0.7 })),
    ...treatments.map((t) => ({ url: siteUrl(`/treatments/${t.slug}`), lastModified: t.updatedAt, priority: 0.7 })),
  ];
}
