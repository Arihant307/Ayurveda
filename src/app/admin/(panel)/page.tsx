import Link from "next/link";
import { Suspense } from "react";
import type { AppointmentStatus } from "@prisma/client";
import { CalendarCheck, CalendarDays, CheckCheck, Clock3, ListChecks, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth";
import { formatDateLong, istDateString, istDayRange } from "@/lib/datetime";
import { toAppointmentDTO } from "@/lib/db/admin";
import { PageHeader } from "@/components/admin/AdminShell";
import { AppointmentTable } from "@/components/admin/AppointmentRow";
import { AppointmentDrawer } from "@/components/admin/AppointmentDrawer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Alert } from "@/components/ui/Alert";
import { LinkButton } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

export const metadata = { title: "Overview" };

export default async function OverviewPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const admin = await requireAdminPage();
  const sp = await searchParams;
  const now = new Date();
  const today = istDateString(now);
  const day = istDayRange(today);

  const count = (where: object) => db.appointment.count({ where });
  const [todayCount, upcoming, total, pending, completed, cancelled, todays] = await Promise.all([
    count({ startsAt: { gte: day.start, lt: day.end }, status: { not: "CANCELLED" } }),
    count({ startsAt: { gte: now }, status: { in: ["PENDING", "CONFIRMED"] } }),
    count({}),
    count({ status: "PENDING", startsAt: { gte: day.start } }),
    count({ status: "COMPLETED" }),
    count({ status: "CANCELLED" }),
    db.appointment.findMany({
      where: { startsAt: { gte: day.start, lt: day.end } },
      include: { doctor: true, treatment: true },
      orderBy: { startsAt: "asc" },
    }),
  ]);

  const cards: { label: string; value: number; href: string; Icon: typeof Clock3; tone: string; status?: AppointmentStatus }[] = [
    { label: "Today", value: todayCount, href: `/admin/appointments?date=${today}`, Icon: CalendarCheck, tone: "bg-navy text-white" },
    { label: "Upcoming", value: upcoming, href: "/admin/appointments", Icon: CalendarDays, tone: "bg-white" },
    { label: "Pending", value: pending, href: "/admin/appointments?status=PENDING", Icon: Clock3, tone: "bg-amber-soft" },
    { label: "Completed", value: completed, href: "/admin/appointments?status=COMPLETED&when=all", Icon: CheckCheck, tone: "bg-white" },
    { label: "Cancelled", value: cancelled, href: "/admin/appointments?status=CANCELLED&when=all", Icon: XCircle, tone: "bg-white" },
    { label: "Total", value: total, href: "/admin/appointments?when=all", Icon: ListChecks, tone: "bg-white" },
  ];

  return (
    <>
      <PageHeader
        title={`Namaste, ${admin.name.split(" ")[0]}`}
        description={formatDateLong(now)}
        actions={<LinkButton href="/admin/calendar" variant="outline" icon={<CalendarDays className="size-4" aria-hidden="true" />}>Open calendar</LinkButton>}
      />
      {sp.denied && (
        <Alert tone="warning" className="mb-6" title="That section is for the clinic owner only.">
          Please ask the owner if you need something changed.
        </Alert>
      )}
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cards.map(({ label, value, href, Icon, tone }) => (
          <li key={label}>
            <Link href={href} className={cn("lift flex h-full flex-col rounded-[var(--radius-card)] border border-line/70 p-4 shadow-soft md:p-5", tone)}>
              <Icon className={cn("size-5", tone.includes("text-white") ? "text-on-navy-muted" : "text-teal-dark")} aria-hidden="true" />
              <span className="mt-3 font-serif text-4xl font-semibold leading-none">{value}</span>
              <span className={cn("mt-1 text-sm font-semibold", tone.includes("text-white") ? "text-on-navy-muted" : "text-muted")}>{label}</span>
            </Link>
          </li>
        ))}
      </ul>

      <section aria-labelledby="today-h" className="mt-10">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="today-h" className="text-3xl">Today’s appointments</h2>
          <Link href={`/admin/calendar?view=day&date=${today}`} className="text-sm font-semibold text-navy hover:underline underline-offset-4">
            Day view
          </Link>
        </div>
        {todays.length === 0 ? (
          <EmptyState title="No appointments today">New online bookings will appear here automatically.</EmptyState>
        ) : (
          <Suspense>
            <AppointmentTable items={todays.map(toAppointmentDTO)} showDate={false} />
          </Suspense>
        )}
      </section>
      <Suspense>
        <AppointmentDrawer />
      </Suspense>
    </>
  );
}
