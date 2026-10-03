import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { toAppointmentDTO, type AppointmentDTO } from "@/lib/db/admin";
import {
  addDays,
  formatDateStringLong,
  formatDateStringMedium,
  formatTimeString,
  istDateString,
  istDayRange,
  isValidDateString,
  minutesToTime,
  timeToMinutes,
  weekdayOf,
  WEEKDAY_SHORT,
} from "@/lib/datetime";
import { STATUS_LABELS } from "@/lib/constants/appointments";
import { PageHeader } from "@/components/admin/AdminShell";
import { AppointmentDrawer } from "@/components/admin/AppointmentDrawer";
import { STATUS_BLOCK } from "@/components/admin/StatusBadge";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

export const metadata = { title: "Calendar" };

type SP = Record<string, string | undefined>;

export default async function CalendarPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const today = istDateString(new Date());
  const view = sp.view === "day" ? "day" : "week";
  const date = sp.date && isValidDateString(sp.date) ? sp.date : today;
  const doctorId = sp.doctor;

  const weekStart = addDays(date, -((weekdayOf(date) + 6) % 7)); // Monday
  const from = view === "day" ? date : weekStart;
  const to = view === "day" ? date : addDays(weekStart, 6);
  const step = view === "day" ? 1 : 7;

  const [doctors, appointments] = await Promise.all([
    db.doctor.findMany({ where: { isActive: true }, orderBy: { displayOrder: "asc" }, include: { availability: true } }),
    db.appointment.findMany({
      where: {
        startsAt: { gte: istDayRange(from).start, lt: istDayRange(to).end },
        ...(doctorId ? { doctorId } : {}),
      },
      include: { doctor: true, treatment: true },
      orderBy: { startsAt: "asc" },
    }),
  ]);
  const items = appointments.map(toAppointmentDTO);
  const shownDoctors = doctorId ? doctors.filter((d) => d.id === doctorId) : doctors;

  const href = (changes: SP) => {
    const next = new URLSearchParams(Object.entries({ view, date, doctor: doctorId, ...changes }).filter(([, v]) => v) as [string, string][]);
    return `/admin/calendar?${next}`;
  };

  return (
    <>
      <PageHeader title="Calendar" description="Click an appointment to see details or make changes." />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <Link href={href({ date: addDays(date, -step) })} className="flex size-11 items-center justify-center rounded-full border border-line bg-white text-navy hover:bg-navy-soft" aria-label={view === "day" ? "Previous day" : "Previous week"}>
            <ChevronLeft className="size-5" aria-hidden="true" />
          </Link>
          <Link href={href({ date: today })} className={buttonClasses("outline", "sm")}>
            Today
          </Link>
          <Link href={href({ date: addDays(date, step) })} className="flex size-11 items-center justify-center rounded-full border border-line bg-white text-navy hover:bg-navy-soft" aria-label={view === "day" ? "Next day" : "Next week"}>
            <ChevronRight className="size-5" aria-hidden="true" />
          </Link>
          <h2 className="ml-2 font-serif text-2xl font-semibold" aria-live="polite">
            {view === "day" ? formatDateStringLong(date) : `${formatDateStringMedium(from)} – ${formatDateStringMedium(to)}`}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="View" className="inline-flex rounded-full border border-line bg-white p-1">
            {(["day", "week"] as const).map((v) => (
              <Link
                key={v}
                href={href({ view: v })}
                aria-current={view === v ? "page" : undefined}
                className={cn("rounded-full px-4 py-1.5 text-sm font-semibold capitalize", view === v ? "bg-navy text-white" : "text-navy hover:bg-navy-soft")}
              >
                {v}
              </Link>
            ))}
          </div>
          <div role="group" aria-label="Doctor" className="flex flex-wrap gap-1">
            <Link href={href({ doctor: undefined })} aria-current={!doctorId ? "page" : undefined} className={chip(!doctorId)}>
              All doctors
            </Link>
            {doctors.map((d) => (
              <Link key={d.id} href={href({ doctor: d.id })} aria-current={doctorId === d.id ? "page" : undefined} className={chip(doctorId === d.id)}>
                {d.name}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <Legend />

      {view === "week" ? (
        <WeekView from={from} today={today} items={items} dayHref={(d) => href({ view: "day", date: d })} open={(id) => href({ id })} />
      ) : (
        <DayView date={date} doctors={shownDoctors} items={items} open={(id) => href({ id })} />
      )}

      <Suspense>
        <AppointmentDrawer />
      </Suspense>
    </>
  );
}

const chip = (active: boolean) =>
  cn("rounded-full border px-3 py-1.5 text-sm font-semibold", active ? "border-navy bg-navy-soft text-navy-dark" : "border-line bg-white text-ink hover:border-teal-dark");

function Legend() {
  return (
    <ul className="mb-4 flex flex-wrap gap-3 text-xs text-muted" aria-label="Colour key">
      {(Object.keys(STATUS_LABELS) as (keyof typeof STATUS_LABELS)[]).map((s) => (
        <li key={s} className="flex items-center gap-1.5">
          <span className={cn("size-3 rounded border-l-4", STATUS_BLOCK[s])} aria-hidden="true" />
          {STATUS_LABELS[s]}
        </li>
      ))}
    </ul>
  );
}

function Block({ a, showDoctor, open }: { a: AppointmentDTO; showDoctor: boolean; open: (id: string) => string }) {
  return (
    <Link
      href={open(a.id)}
      scroll={false}
      className={cn("block rounded-lg border-l-4 px-2.5 py-1.5 text-sm transition-shadow hover:shadow-soft", STATUS_BLOCK[a.status])}
      aria-label={`${formatTimeString(a.time)}, ${a.patientName}, ${a.doctor.name}, ${STATUS_LABELS[a.status]}`}
    >
      <span className="block font-bold">{formatTimeString(a.time)}</span>
      <span className="block truncate">{a.patientName}</span>
      {showDoctor && <span className="block truncate text-xs opacity-80">{a.doctor.name}</span>}
    </Link>
  );
}

function WeekView({ from, today, items, dayHref, open }: { from: string; today: string; items: AppointmentDTO[]; dayHref: (d: string) => string; open: (id: string) => string }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  return (
    <div className="grid gap-3 md:grid-cols-7 md:gap-2">
      {days.map((d) => {
        const dayItems = items.filter((a) => a.date === d);
        return (
          <section key={d} aria-label={formatDateStringLong(d)} className={cn("min-h-28 rounded-2xl border bg-white p-2.5", d === today ? "border-navy ring-2 ring-navy/20" : "border-line/70")}>
            <Link href={dayHref(d)} className="mb-2 flex items-baseline justify-between gap-1 rounded-md px-1 hover:bg-navy-soft">
              <span className="text-sm font-bold uppercase text-muted">{WEEKDAY_SHORT[weekdayOf(d)]}</span>
              <span className={cn("font-serif text-2xl font-semibold", d === today ? "text-navy" : "text-ink")}>{Number(d.slice(8))}</span>
            </Link>
            {dayItems.length === 0 ? (
              <p className="px-1 text-xs text-muted">No appointments</p>
            ) : (
              <ul className="space-y-1.5">
                {dayItems.map((a) => (
                  <li key={a.id}>
                    <Block a={a} showDoctor open={open} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function DayView({
  date,
  doctors,
  items,
  open,
}: {
  open: (id: string) => string;
  date: string;
  doctors: { id: string; name: string; availability: { weekday: number; startTime: string; endTime: string; slotMinutes: number }[] }[];
  items: AppointmentDTO[];
}) {
  const weekday = weekdayOf(date);
  const sessions = doctors.flatMap((d) => d.availability.filter((s) => s.weekday === weekday));
  const itemMinutes = items.map((a) => timeToMinutes(a.time));
  const start = Math.min(...sessions.map((s) => timeToMinutes(s.startTime)), ...itemMinutes, 10 * 60);
  const end = Math.max(...sessions.map((s) => timeToMinutes(s.endTime)), ...itemMinutes.map((m) => m + 30), 13 * 60);
  const rowStep = Math.min(30, ...sessions.map((s) => s.slotMinutes));
  const rows: number[] = [];
  for (let m = Math.floor(start / rowStep) * rowStep; m < end; m += rowStep) rows.push(m);
  const inSession = (doctorId: string, m: number) =>
    doctors
      .find((d) => d.id === doctorId)
      ?.availability.some((s) => s.weekday === weekday && timeToMinutes(s.startTime) <= m && m < timeToMinutes(s.endTime));

  if (doctors.length === 0) return <p className="text-muted">No active doctors.</p>;

  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line/70 bg-white shadow-soft">
      <table className="w-full min-w-[20rem] table-fixed text-sm">
        <thead className="border-b border-line bg-soft">
          <tr>
            <th scope="col" className="w-20 px-2 py-3 text-left text-muted">Time</th>
            {doctors.map((d) => (
              <th key={d.id} scope="col" className="px-2 py-3 text-left font-semibold">
                {d.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m} className="border-b border-line/60 last:border-0">
              <th scope="row" className="px-2 py-2 text-left align-top font-semibold text-muted">
                {formatTimeString(minutesToTime(m))}
              </th>
              {doctors.map((d) => {
                const cell = items.filter((a) => a.doctor.id === d.id && timeToMinutes(a.time) >= m && timeToMinutes(a.time) < m + rowStep);
                return (
                  <td key={d.id} className={cn("px-1.5 py-1 align-top", !inSession(d.id, m) && "bg-soft/50")}>
                    <div className="space-y-1">
                      {cell.map((a) => (
                        <Block key={a.id} a={a} showDoctor={false} open={open} />
                      ))}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
