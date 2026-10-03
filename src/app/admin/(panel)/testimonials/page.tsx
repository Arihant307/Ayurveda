import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth";
import { PageHeader } from "@/components/admin/AdminShell";
import { TestimonialsManager } from "@/components/admin/TestimonialsManager";

export const metadata = { title: "Testimonials" };

export default async function TestimonialsAdminPage() {
  await requireAdminPage("OWNER");
  const items = await db.testimonial.findMany({ orderBy: { createdAt: "desc" } });
  return (
    <>
      <PageHeader title="Testimonials" description="Patient feedback shown on the home page once published." />
      <TestimonialsManager items={items.map((t) => ({ id: t.id, patientName: t.patientName, context: t.context, content: t.content, rating: t.rating, isPublished: t.isPublished, createdAt: t.createdAt.toISOString() }))} />
    </>
  );
}
