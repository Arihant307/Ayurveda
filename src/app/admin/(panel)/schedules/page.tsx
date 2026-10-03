import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth";
import { dateStringToDb, dbDateToString, istDateString } from "@/lib/datetime";
import { PageHeader } from "@/components/admin/AdminShell";
import { ScheduleEditor } from "@/components/admin/ScheduleEditor";
import { BlockedDates } from "@/components/admin/BlockedDates";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";

export const metadata = { title: "Schedules & holidays" };

export default async function SchedulesPage({ searchParams }: { searchParams: Promise<{ doctor?: string }> }) {
  await requireAdminPage("OWNER");
  const sp = await searchParams;
  const today = dateStringToDb(istDateString(new Date()));
  const [doctors, holidays, settings] = await Promise.all([
    db.doctor.findMany({ orderBy: [{ isActive: "desc" }, { displayOrder: "asc" }], include: { availability: true } }),
    db.blockedDate.findMany({ where: { doctorId: null, date: { gte: today } }, orderBy: { date: "asc" } }),
    db.clinicSettings.findUnique({ where: { id: 1 } }),
  ]);
  const doctor = doctors.find((d) => d.id === sp.doctor) ?? doctors[0];
  const leave = doctor
    ? await db.blockedDate.findMany({ where: { doctorId: doctor.id, date: { gte: today } }, orderBy: { date: "asc" } })
    : [];
  const toRow = (b: { id: string; date: Date; reason: string | null }) => ({ id: b.id, date: dbDateToString(b.date), reason: b.reason });

  return (
    <>
      <PageHeader title="Schedules & holidays" description="Changes apply to online booking immediately." />
      <div className="space-y-8">
        <SettingsForm bookingWindowDays={settings?.bookingWindowDays ?? 30} minLeadMinutes={settings?.minLeadMinutes ?? 120} />

        <BlockedDates
          doctorId={null}
          title="Clinic holidays"
          description="The whole clinic is closed — no one can book online on these dates."
          rows={holidays.map(toRow)}
          emptyText="No upcoming holidays"
        />

        {doctor ? (
          <section aria-label="Doctor schedules" className="space-y-5">
            <div role="tablist" aria-label="Choose doctor" className="flex flex-wrap gap-2">
              {doctors.map((d) => (
                <Link
                  key={d.id}
                  role="tab"
                  aria-selected={d.id === doctor.id}
                  href={`/admin/schedules?doctor=${d.id}`}
                  scroll={false}
                  className={cn("rounded-full border-2 px-4 py-2 font-semibold", d.id === doctor.id ? "border-green bg-green text-white" : "border-line bg-white text-ink hover:border-teal-deep")}
                >
                  {d.name}
                  {!d.isActive && " (inactive)"}
                </Link>
              ))}
            </div>
            <ScheduleEditor key={doctor.id} doctorId={doctor.id} doctorName={doctor.name} initial={doctor.availability} />
            <BlockedDates
              key={`leave-${doctor.id}`}
              doctorId={doctor.id}
              title={`${doctor.name} — leave`}
              description="Days this doctor is away. Patients can't book with them on these dates."
              rows={leave.map(toRow)}
              emptyText="No upcoming leave"
            />
          </section>
        ) : (
          <EmptyState title="Add a doctor first" />
        )}
      </div>
    </>
  );
}
