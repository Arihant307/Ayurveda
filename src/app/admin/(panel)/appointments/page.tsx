import Link from "next/link";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { findAppointments, parseAppointmentFilters } from "@/lib/db/appointment-search";
import { PageHeader } from "@/components/admin/AdminShell";
import { AppointmentFilters } from "@/components/admin/AppointmentFilters";
import { AppointmentTable } from "@/components/admin/AppointmentRow";
import { AppointmentDrawer } from "@/components/admin/AppointmentDrawer";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonClasses } from "@/components/ui/Button";

export const metadata = { title: "Appointments" };

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const filters = parseAppointmentFilters(sp);
  const [result, doctors] = await Promise.all([
    findAppointments(filters),
    db.doctor.findMany({ select: { id: true, name: true }, orderBy: { displayOrder: "asc" } }),
  ]);
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const pageHref = (p: number) => {
    const next = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && k !== "id" ? [[k, v]] : [])));
    next.set("page", String(p));
    return `/admin/appointments?${next}`;
  };

  return (
    <>
      <PageHeader title="Appointments" description={`${result.total} ${result.total === 1 ? "appointment" : "appointments"} found`} />
      <Suspense>
        <AppointmentFilters doctors={doctors} />
      </Suspense>
      {result.items.length === 0 ? (
        <EmptyState title="No appointments match">Try clearing the filters or searching for something else.</EmptyState>
      ) : (
        <Suspense>
          <AppointmentTable items={result.items} />
        </Suspense>
      )}
      {pages > 1 && (
        <nav aria-label="Pages" className="mt-6 flex items-center justify-between gap-3">
          {result.page > 1 ? (
            <Link href={pageHref(result.page - 1)} className={buttonClasses("outline", "sm")}>Previous</Link>
          ) : <span />}
          <span className="text-sm text-muted">Page {result.page} of {pages}</span>
          {result.page < pages ? (
            <Link href={pageHref(result.page + 1)} className={buttonClasses("outline", "sm")}>Next</Link>
          ) : <span />}
        </nav>
      )}
      <Suspense>
        <AppointmentDrawer />
      </Suspense>
    </>
  );
}
