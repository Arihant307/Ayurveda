/**
 * Pure availability engine — no database access, fully unit-testable.
 *
 * Availability is always computed from schedule data (weekly sessions, blocked
 * dates, existing appointments, clinic rules). No slot rows are ever stored.
 */
import {
  addDays,
  istDateString,
  istToUtc,
  minutesToTime,
  timeToMinutes,
  weekdayOf,
} from "@/lib/datetime";
import { MORNING_CUTOFF_MINUTES } from "@/lib/constants/appointments";

export type Session = { weekday: number; startTime: string; endTime: string; slotMinutes: number };
export type BusyInterval = { startsAt: Date; endsAt: Date };
export type BookingRules = { bookingWindowDays: number; minLeadMinutes: number };

export type DoctorSchedule = {
  sessions: Session[];
  /** Clinic-local dates ("YYYY-MM-DD") that are clinic-wide holidays. */
  clinicHolidays: ReadonlySet<string>;
  /** Clinic-local dates on which this doctor is on leave. */
  leaveDates: ReadonlySet<string>;
  /** Existing non-cancelled appointments for this doctor. */
  busy: BusyInterval[];
};

export type DayStatus =
  | "available"
  | "past"
  | "beyond-window"
  | "closed"
  | "holiday"
  | "leave"
  | "full";

export type SlotPeriod = "morning" | "evening";

export type Slot = {
  /** Clinic-local "HH:mm" */
  time: string;
  startsAt: Date;
  endsAt: Date;
  period: SlotPeriod;
  available: boolean;
  /** Why the slot is not available. */
  reason?: "booked" | "too-soon";
};

/** First and last dates patients may book, in clinic time. */
export function bookableDateRange(now: Date, rules: BookingRules) {
  const first = istDateString(now);
  return { first, last: addDays(first, Math.max(rules.bookingWindowDays, 1) - 1) };
}

/** Every slot that the weekly schedule produces on a date (ignores bookings and rules). */
export function scheduledSlots(date: string, sessions: Session[]): Omit<Slot, "available" | "reason">[] {
  const weekday = weekdayOf(date);
  const out: Omit<Slot, "available" | "reason">[] = [];
  const seen = new Set<number>();
  const daySessions = sessions
    .filter((s) => s.weekday === weekday && s.slotMinutes > 0)
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  for (const session of daySessions) {
    const end = timeToMinutes(session.endTime);
    for (let t = timeToMinutes(session.startTime); t + session.slotMinutes <= end; t += session.slotMinutes) {
      if (seen.has(t)) continue; // defensive: overlapping sessions
      seen.add(t);
      const time = minutesToTime(t);
      const startsAt = istToUtc(date, time);
      out.push({
        time,
        startsAt,
        endsAt: new Date(startsAt.getTime() + session.slotMinutes * 60_000),
        period: t < MORNING_CUTOFF_MINUTES ? "morning" : "evening",
      });
    }
  }
  return out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

const overlaps = (a: BusyInterval, b: BusyInterval) => a.startsAt < b.endsAt && b.startsAt < a.endsAt;

/** Status of a whole date, before looking at individual slots. */
function dateGate(date: string, schedule: DoctorSchedule, now: Date, rules: BookingRules): DayStatus | null {
  const { first, last } = bookableDateRange(now, rules);
  if (date < first) return "past";
  if (date > last) return "beyond-window";
  if (schedule.clinicHolidays.has(date)) return "holiday";
  if (schedule.leaveDates.has(date)) return "leave";
  if (!schedule.sessions.some((s) => s.weekday === weekdayOf(date))) return "closed";
  return null;
}

/** All slots for a date, each flagged available or not. Empty if the date itself is not bookable. */
export function daySlots(date: string, schedule: DoctorSchedule, now: Date, rules: BookingRules): Slot[] {
  if (dateGate(date, schedule, now, rules)) return [];
  const earliest = now.getTime() + rules.minLeadMinutes * 60_000;

  return scheduledSlots(date, schedule.sessions).map((slot) => {
    if (slot.startsAt.getTime() < earliest) return { ...slot, available: false, reason: "too-soon" as const };
    if (schedule.busy.some((b) => overlaps(b, slot))) return { ...slot, available: false, reason: "booked" as const };
    return { ...slot, available: true };
  });
}

export function dayStatus(date: string, schedule: DoctorSchedule, now: Date, rules: BookingRules): DayStatus {
  const gate = dateGate(date, schedule, now, rules);
  if (gate) return gate;
  const slots = daySlots(date, schedule, now, rules);
  if (slots.length === 0) return "closed";
  if (slots.every((s) => !s.available)) {
    // If nothing is booked, the remaining slots are simply in the past / too soon.
    return slots.some((s) => s.reason === "booked") ? "full" : "past";
  }
  return "available";
}

export type SlotCheck =
  | { ok: true; slot: Slot }
  | { ok: false; reason: "invalid-time" | "date-unavailable" | "booked" | "too-soon"; dayStatus?: DayStatus };

/** Validate that one specific start time can be booked right now. */
export function checkSlot(
  date: string,
  time: string,
  schedule: DoctorSchedule,
  now: Date,
  rules: BookingRules,
): SlotCheck {
  const gate = dateGate(date, schedule, now, rules);
  if (gate) return { ok: false, reason: "date-unavailable", dayStatus: gate };
  const slot = daySlots(date, schedule, now, rules).find((s) => s.time === time);
  if (!slot) return { ok: false, reason: "invalid-time" };
  if (!slot.available) return { ok: false, reason: slot.reason ?? "booked" };
  return { ok: true, slot };
}

/** Human-readable consultation timings from weekly sessions, e.g. for doctor profiles. */
export function summariseTimings(sessions: Pick<Session, "weekday" | "startTime" | "endTime">[]) {
  const byDay = new Map<number, string>();
  for (let d = 0; d < 7; d++) {
    const key = sessions
      .filter((s) => s.weekday === d)
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .map((s) => `${s.startTime}-${s.endTime}`)
      .join(",");
    byDay.set(d, key);
  }
  // Group consecutive weekdays (Mon→Sun order) that share identical sessions.
  const order = [1, 2, 3, 4, 5, 6, 0];
  const groups: { days: number[]; sessions: { startTime: string; endTime: string }[] }[] = [];
  for (const d of order) {
    const key = byDay.get(d) ?? "";
    const last = groups[groups.length - 1];
    if (last && (byDay.get(last.days[last.days.length - 1]) ?? "") === key) last.days.push(d);
    else
      groups.push({
        days: [d],
        sessions: key
          ? key.split(",").map((p) => {
              const [startTime, endTime] = p.split("-");
              return { startTime, endTime };
            })
          : [],
      });
  }
  return groups;
}
