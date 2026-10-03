import { getActiveDoctors } from "@/lib/db/queries";
import { pageMetadata } from "@/lib/seo";
import { PageHero, Section } from "@/components/site/Section";
import { DoctorCard } from "@/components/site/DoctorCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { BookingCta } from "@/components/site/BookingCta";

export const revalidate = 300;

export const metadata = pageMetadata({
  title: "Our Ayurvedic Doctors in Vaishali Nagar",
  description:
    "Meet the Ayurvedic doctors at Kumar Ayurveda, Vaishali Nagar, Jaipur — Dr. Vijay Kumar and Dr. Jolly Sharma. View consultation timings and book online.",
  path: "/doctors",
});

export default async function DoctorsPage() {
  const doctors = await getActiveDoctors();
  return (
    <>
      <PageHero eyebrow="Our physicians" title="Ayurvedic doctors in Vaishali Nagar, Jaipur">
        Every treatment plan at Kumar Ayurveda begins with an unhurried consultation with one of our physicians.
      </PageHero>
      <Section>
        <div className="container-site">
          {doctors.length === 0 ? (
            <EmptyState title="Doctor profiles are being updated">Please call us to book a consultation.</EmptyState>
          ) : (
            <div className="mx-auto grid max-w-4xl gap-6 sm:grid-cols-2">
              {doctors.map((d) => (
                <DoctorCard key={d.id} doctor={d} />
              ))}
            </div>
          )}
        </div>
      </Section>
      <BookingCta />
    </>
  );
}
