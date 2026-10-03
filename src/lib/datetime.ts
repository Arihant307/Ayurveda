/**
 * Date/time helpers. The clinic runs entirely in Asia/Kolkata (IST, UTC+05:30,
 * no daylight saving), so conversions use a fixed offset and formatting uses Intl.
 *
 * Vocabulary:
 *  - "date string"  = clinic-local calendar date, "YYYY-MM-DD"
 *  - "time string"  = clinic-local wall-clock time, "HH:mm"
 *  - Date objects   = absolute instants (stored as UTC in the database)
 */

export const CLINIC_TIME_ZONE = "Asia/Kolkata";
const IST_OFFSET_MINUTES = 330;
const MINUTE = 60_000;
const DAY = 86_400_000;

export const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const pad = (n: number) => String(n).padStart(2, "0");

/** Wall-clock parts of an instant, as seen in the clinic's time zone. */
export function istParts(instant: Date) {
  const shifted = new Date(instant.getTime() + IST_OFFSET_MINUTES * MINUTE);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

/** Clinic-local date string for an instant. */
export function istDateString(instant: Date): string {
  const p = istParts(instant);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Clinic-local time string for an instant. */
export function istTimeString(instant: Date): string {
  const p = istParts(instant);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** Absolute instant for a clinic-local date + time. */
export function istToUtc(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - IST_OFFSET_MINUTES * MINUTE);
}

/** Start and end (exclusive) instants of a clinic-local day. */
export function istDayRange(date: string): { start: Date; end: Date } {
  const start = istToUtc(date, "00:00");
  return { start, end: new Date(start.getTime() + DAY) };
}

export function isValidDateString(date: string): boolean {
  if (!DATE_RE.test(date)) return false;
  const [y, m, d] = date.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

/** 0 = Sunday … 6 = Saturday */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d) + days * DAY);
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

export function timeToMinutes(time: string): number {
  const [hh, mm] = time.split(":").map(Number);
  return hh * 60 + mm;
}

export function minutesToTime(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** A Postgres DATE column comes back as a Date at UTC midnight. */
export function dbDateToString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function dateStringToDb(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

// ---------- Formatting (always in clinic time) ----------

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Dates are assembled by hand so the output is identical on every server and browser.
/** "Monday, 5 October 2026" */
export function formatDateLong(instant: Date) {
  const p = istParts(instant);
  return `${DAYS[p.weekday]}, ${p.day} ${MONTHS[p.month - 1]} ${p.year}`;
}
/** "Mon, 5 Oct 2026" */
export function formatDateMedium(instant: Date) {
  const p = istParts(instant);
  return `${DAYS[p.weekday].slice(0, 3)}, ${p.day} ${MONTHS[p.month - 1].slice(0, 3)} ${p.year}`;
}
/** "5 Oct" */
export function formatDateShort(instant: Date) {
  const p = istParts(instant);
  return `${p.day} ${MONTHS[p.month - 1].slice(0, 3)}`;
}
/** "10:30 AM" */
export const formatTime = (instant: Date) => formatTimeString(istTimeString(instant));
/** "5 Oct 2026, 10:30 AM" */
export const formatDateTime = (instant: Date) =>
  `${formatDateMedium(instant)}, ${formatTime(instant)}`;

/** Format a clinic-local date string, e.g. for "YYYY-MM-DD" → "Monday, 5 October 2026". */
export const formatDateStringLong = (date: string) => formatDateLong(istToUtc(date, "12:00"));
export const formatDateStringMedium = (date: string) => formatDateMedium(istToUtc(date, "12:00"));

/** "HH:mm" → "5:30 PM" */
export function formatTimeString(time: string): string {
  const [hh, mm] = time.split(":").map(Number);
  const suffix = hh >= 12 ? "PM" : "AM";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${pad(mm)} ${suffix}`;
}

/** "YYYY-MM" → "October 2026" */
export function formatMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
