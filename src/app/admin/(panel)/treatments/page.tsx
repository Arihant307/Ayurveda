import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth";
import { PageHeader } from "@/components/admin/AdminShell";
import { TreatmentsManager } from "@/components/admin/TreatmentsManager";

export const metadata = { title: "Treatments" };

export default async function TreatmentsAdminPage() {
  await requireAdminPage("OWNER");
  const treatments = await db.treatment.findMany({ orderBy: [{ isVisible: "desc" }, { displayOrder: "asc" }] });
  return (
    <>
      <PageHeader title="Treatments" description="Therapies listed on the website." />
      <TreatmentsManager treatments={treatments.map(({ createdAt: _c, updatedAt: _u, ...t }) => t)} />
    </>
  );
}
