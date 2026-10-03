/**
 * Database-backed availability. This is the single entry point used by the
 * calendar API, the slots API, the booking endpoint and admin rescheduling.
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  addDays,
  dateStringToDb,
  daysInMonth,
  dbDateToString,
  istDayRange,
} from "@/lib/datetime";
import {
  bookableDateRange,
  checkSlot,
  daySlots,
  dayStatus,
  type BookingRules,
  type DayStatus,
  type DoctorSchedule,
  type Slot,
  type SlotCheck,
} from "./engine";

export * from "./engine";

type Client = Prisma.TransactionClient | typeof db;

export async function getBookingRules(client: Client = db): Promise<BookingRules> {
  const settings = await client.clinicSettings.findUnique({ where: { id: 1 } });
  return {
    bookingWindowDays: settings?.bookingWindowDays ?? 30,
    minLeadMinutes: settings?.minLeadMinutes ?? 120,
  };
}

/** Load everything the engine needs for one doctor between two clinic-local dates (inclusive). */
export async function loadDoctorSchedule(
  doctorId: string,
  fromDate: string,
  toDate: string,
  opts: { client?: Client; excludeAppointmentId?: string } = {},
): Promise<DoctorSchedule> {
  const client = opts.client ?? db;
  const from = istDayRange(fromDate).start;
  const to = istDayRange(toDate).end;

  const [sessions, blocked, busy] = await Promise.all([
    client.doctorAvailability.findMany({ where: { doctorId } }),
    client.blockedDate.findMany({
      where: {
        date: { gte: dateStringToDb(fromDate), lte: dateStringToDb(toDate) },
        OR: [{ doctorId: null }, { doctorId }],
      },
    }),
    client.appointment.findMany({
      where: {
        doctorId,
        status: { not: "CANCELLED" },
        startsAt: { lt: to },
        endsAt: { gt: from },
        ...(opts.excludeAppointmentId ? { id: { not: opts.excludeAppointmentId } } : {}),
      },
      select: { startsAt: true, endsAt: true },
    }),
  ]);

  return {
    sessions,
    clinicHolidays: new Set(blocked.filter((b) => !b.doctorId).map((b) => dbDateToString(b.date))),
    leaveDates: new Set(blocked.filter((b) => b.doctorId).map((b) => dbDateToString(b.date))),
    busy,
  };
}

export type CalendarDay = { date: string; status: DayStatus };

/** Status of every day in a month ("YYYY-MM") for one doctor. */
export async function getMonthCalendar(
  doctorId: string,
  month: string,
  now = new Date(),
  opts: { ignoreLeadTime?: boolean; excludeAppointmentId?: string } = {},
): Promise<{ days: CalendarDay[]; firstBookable: string; lastBookable: string }> {
  const baseRules = await getBookingRules();
  const rules = opts.ignoreLeadTime ? { ...baseRules, minLeadMinutes: 0 } : baseRules;
  const first = `${month}-01`;
  const last = addDays(first, daysInMonth(month) - 1);
  const schedule = await loadDoctorSchedule(doctorId, first, last, {
    excludeAppointmentId: opts.excludeAppointmentId,
  });
  const days: CalendarDay[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) {
    days.push({ date: d, status: dayStatus(d, schedule, now, rules) });
  }
  const range = bookableDateRange(now, rules);
  return { days, firstBookable: range.first, lastBookable: range.last };
}

/** Slots for one doctor on one date. */
export async function getSlotsForDate(
  doctorId: string,
  date: string,
  opts: { now?: Date; excludeAppointmentId?: string; ignoreLeadTime?: boolean } = {},
): Promise<{ status: DayStatus; slots: Slot[] }> {
  const now = opts.now ?? new Date();
  const rules = await getBookingRules();
  const effectiveRules = opts.ignoreLeadTime ? { ...rules, minLeadMinutes: 0 } : rules;
  const schedule = await loadDoctorSchedule(doctorId, date, date, {
    excludeAppointmentId: opts.excludeAppointmentId,
  });
  return {
    status: dayStatus(date, schedule, now, effectiveRules),
    slots: daySlots(date, schedule, now, effectiveRules),
  };
}

/** Re-check a single slot (inside a transaction when booking or rescheduling). */
export async function checkSlotBookable(
  doctorId: string,
  date: string,
  time: string,
  opts: { client?: Client; now?: Date; excludeAppointmentId?: string; ignoreLeadTime?: boolean } = {},
): Promise<SlotCheck> {
  const rules = await getBookingRules(opts.client);
  const effectiveRules = opts.ignoreLeadTime ? { ...rules, minLeadMinutes: 0 } : rules;
  const schedule = await loadDoctorSchedule(doctorId, date, date, opts);
  return checkSlot(date, time, schedule, opts.now ?? new Date(), effectiveRules);
}
