import "server-only";
import type { AppointmentStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { istDateString, istDayRange, isValidDateString } from "@/lib/datetime";
import { APPOINTMENT_STATUSES, normalizeIndianPhone } from "@/lib/validation";
import { toAppointmentDTO } from "./admin";

export type AppointmentFilters = {
  q?: string;
  doctor?: string;
  date?: string;
  status?: AppointmentStatus;
  when?: "upcoming" | "past" | "all";
  page: number;
};

export const PAGE_SIZE = 25;

export function parseAppointmentFilters(sp: Record<string, string | string[] | undefined>): AppointmentFilters {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
  };
  const status = one("status");
  const when = one("when");
  const date = one("date");
  return {
    q: one("q")?.slice(0, 80),
    doctor: one("doctor"),
    date: date && isValidDateString(date) ? date : undefined,
    status: APPOINTMENT_STATUSES.includes(status as AppointmentStatus) ? (status as AppointmentStatus) : undefined,
    when: when === "past" || when === "all" ? when : date ? "all" : "upcoming",
    page: Math.max(1, Number(one("page")) || 1),
  };
}

export async function findAppointments(f: AppointmentFilters) {
  const and: Prisma.AppointmentWhereInput[] = [];
  if (f.q) {
    const digits = normalizeIndianPhone(f.q);
    and.push({
      OR: [
        { patientName: { contains: f.q, mode: "insensitive" } },
        { code: { contains: f.q.toUpperCase() } },
        ...(digits.length >= 3 ? [{ patientPhone: { contains: digits } }] : []),
      ],
    });
  }
  if (f.doctor) and.push({ doctorId: f.doctor });
  if (f.status) and.push({ status: f.status });
  if (f.date) {
    const r = istDayRange(f.date);
    and.push({ startsAt: { gte: r.start, lt: r.end } });
  } else if (f.when === "upcoming") {
    and.push({ startsAt: { gte: istDayRange(istDateString(new Date())).start } });
  } else if (f.when === "past") {
    and.push({ startsAt: { lt: new Date() } });
  }
  const where: Prisma.AppointmentWhereInput = and.length ? { AND: and } : {};
  const [total, rows] = await Promise.all([
    db.appointment.count({ where }),
    db.appointment.findMany({
      where,
      include: { doctor: true, treatment: true },
      orderBy: { startsAt: f.when === "past" ? "desc" : "asc" },
      skip: (f.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  return { total, page: f.page, pageSize: PAGE_SIZE, items: rows.map(toAppointmentDTO) };
}
