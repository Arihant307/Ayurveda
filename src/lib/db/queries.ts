/** Read-only queries for the public site. */
import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { summariseTimings, type Session } from "@/lib/availability/engine";
import { timeToMinutes, minutesToTime } from "@/lib/datetime";

export const getActiveDoctors = cache(() =>
  db.doctor.findMany({
    where: { isActive: true },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    include: { availability: true },
  }),
);

export const getDoctorBySlug = cache((slug: string) =>
  db.doctor.findFirst({ where: { slug, isActive: true }, include: { availability: true } }),
);

export const getVisibleTreatments = cache(() =>
  db.treatment.findMany({
    where: { isVisible: true },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  }),
);

export const getTreatmentBySlug = cache((slug: string) =>
  db.treatment.findFirst({ where: { slug, isVisible: true } }),
);

export const getPublishedTestimonials = cache(() =>
  db.testimonial.findMany({ where: { isPublished: true }, orderBy: { createdAt: "desc" }, take: 9 }),
);

/** Merge sessions per weekday (union across doctors). */
export function mergeSessions(sessions: Pick<Session, "weekday" | "startTime" | "endTime">[]) {
  const out: { weekday: number; startTime: string; endTime: string }[] = [];
  for (let d = 0; d < 7; d++) {
    const ranges = sessions
      .filter((s) => s.weekday === d)
      .map((s) => [timeToMinutes(s.startTime), timeToMinutes(s.endTime)] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const r of ranges) {
      const last = merged[merged.length - 1];
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
      else merged.push([...r]);
    }
    for (const [s, e] of merged) out.push({ weekday: d, startTime: minutesToTime(s), endTime: minutesToTime(e) });
  }
  return out;
}

/** Clinic opening hours, derived from the schedules of active doctors. */
export const getClinicHours = cache(async () => {
  const doctors = await getActiveDoctors();
  const merged = mergeSessions(doctors.flatMap((d) => d.availability));
  return { groups: summariseTimings(merged), sessions: merged };
});
