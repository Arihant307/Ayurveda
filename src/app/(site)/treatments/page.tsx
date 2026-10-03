import { getVisibleTreatments } from "@/lib/db/queries";
import { pageMetadata } from "@/lib/seo";
import { PageHero, Section } from "@/components/site/Section";
import { TreatmentCard } from "@/components/site/TreatmentCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { BookingCta } from "@/components/site/BookingCta";

export const revalidate = 300;

export const metadata = pageMetadata({
  title: "Ayurvedic Treatments & Therapies in Jaipur",
  description:
    "Panchakarma, Abhyanga, Shirodhara, Ayurvedic consultation, detox, stress and lifestyle management at Kumar Ayurveda, Vaishali Nagar, Jaipur.",
  path: "/treatments",
});

export default async function TreatmentsPage() {
  const treatments = await getVisibleTreatments();
  return (
    <>
      <PageHero eyebrow="Therapies" title="Ayurvedic treatments in Jaipur">
        Classical therapies and guidance programmes. Every treatment is recommended only after a consultation, so that it
        suits you and your health history.
      </PageHero>
      <Section>
        <div className="container-site">
          {treatments.length === 0 ? (
            <EmptyState title="Treatments are being updated">Please call us to learn about our therapies.</EmptyState>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {treatments.map((t) => (
                <TreatmentCard key={t.id} treatment={t} headingLevel="h2" />
              ))}
            </div>
          )}
        </div>
      </Section>
      <BookingCta title="Not sure where to start?" text="Book an Ayurvedic consultation — your physician will suggest what suits you, if anything at all." />
    </>
  );
}
