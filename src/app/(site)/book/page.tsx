import { Suspense } from "react";
import { Phone, ShieldCheck } from "lucide-react";
import { CLINIC } from "@/lib/constants/clinic";
import { getActiveDoctors, getVisibleTreatments } from "@/lib/db/queries";
import { pageMetadata } from "@/lib/seo";
import { BookingWizard } from "@/components/booking/BookingWizard";
import { Spinner } from "@/components/ui/Spinner";

export const revalidate = 300;

export const metadata = pageMetadata({
  title: "Book an Appointment Online",
  description:
    "Book an appointment with an Ayurvedic doctor at Kumar Ayurveda, Vaishali Nagar, Jaipur. Choose your doctor, date and time online in about a minute.",
  path: "/book",
});

export default async function BookPage() {
  const [doctors, treatments] = await Promise.all([getActiveDoctors(), getVisibleTreatments()]);
  return (
    <div className="bg-cream">
      <div className="container-site max-w-3xl pb-16 pt-6 md:pt-12">
        <header className="mb-6 md:mb-8">
          <p className="eyebrow">Online booking</p>
          <h1 className="mt-2 text-[2.4rem] leading-tight md:text-5xl">Book an appointment</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.95rem] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-teal-deep" aria-hidden="true" /> Takes about a minute
            </span>
            <a href={CLINIC.phoneHref} className="inline-flex items-center gap-1.5 font-semibold text-green hover:underline underline-offset-4">
              <Phone className="size-4" aria-hidden="true" /> Prefer to call? {CLINIC.phoneDisplay}
            </a>
          </p>
        </header>
        <Suspense fallback={<div className="flex justify-center py-20"><Spinner label="Loading booking…" /></div>}>
          <BookingWizard
            doctors={doctors.map((d) => ({
              slug: d.slug,
              name: d.name,
              specialization: d.specialization,
              qualification: d.qualification,
              photoUrl: d.photoUrl,
            }))}
            treatments={treatments.map((t) => ({ slug: t.slug, name: t.name }))}
          />
        </Suspense>
      </div>
    </div>
  );
}
