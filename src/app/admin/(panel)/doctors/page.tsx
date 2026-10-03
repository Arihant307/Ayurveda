import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth";
import { PageHeader } from "@/components/admin/AdminShell";
import { DoctorsManager } from "@/components/admin/DoctorsManager";

export const metadata = { title: "Doctors" };

export default async function DoctorsAdminPage() {
  await requireAdminPage("OWNER");
  const now = new Date();
  const doctors = await db.doctor.findMany({
    orderBy: [{ isActive: "desc" }, { displayOrder: "asc" }],
    include: { _count: { select: { appointments: { where: { startsAt: { gte: now }, status: { in: ["PENDING", "CONFIRMED"] } } } } } },
  });
  return (
    <>
      <PageHeader title="Doctors" description="Profiles shown on the website. Working hours are set under Schedules." />
      <DoctorsManager
        doctors={doctors.map(({ _count, createdAt: _c, updatedAt: _u, ...d }) => ({ ...d, upcoming: _count.appointments }))}
      />
    </>
  );
}
