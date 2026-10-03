import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck, CheckCircle2, ChevronLeft, Clock, Phone } from "lucide-react";
import { CLINIC } from "@/lib/constants/clinic";
import { getTreatmentBySlug, getVisibleTreatments } from "@/lib/db/queries";
import { breadcrumbJsonLd, pageMetadata, therapyJsonLd } from "@/lib/seo";
import { AnchorButton, LinkButton } from "@/components/ui/Button";
import { JsonLd } from "@/components/site/JsonLd";
import { TreatmentCard, TREATMENT_PLACEHOLDER } from "@/components/site/TreatmentCard";
import { Section, SectionHeading } from "@/components/site/Section";

export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getTreatmentBySlug((await params).slug);
  if (!t) return { title: "Treatment not found" };
  return pageMetadata({
    title: `${t.name} in Jaipur`,
    description: `${t.shortDescription} ${t.name} at Kumar Ayurveda, Vaishali Nagar, Jaipur.`.slice(0, 300),
    path: `/treatments/${t.slug}`,
    image: t.imageUrl,
  });
}

export default async function TreatmentPage({ params }: Props) {
  const slug = (await params).slug;
  const [treatment, all] = await Promise.all([getTreatmentBySlug(slug), getVisibleTreatments()]);
  if (!treatment) notFound();
  const related = all.filter((t) => t.id !== treatment.id).slice(0, 3);
  const bookHref = `/book?treatment=${treatment.slug}`;

  return (
    <>
      <JsonLd
        data={[
          therapyJsonLd(treatment),
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Treatments", path: "/treatments" },
            { name: treatment.name, path: `/treatments/${treatment.slug}` },
          ]),
        ]}
      />
      <div className="bg-cream-deep">
        <div className="container-site grid gap-10 py-8 md:grid-cols-2 md:items-center md:py-14">
          <div className="animate-fade-up">
            <Link href="/treatments" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-green hover:underline underline-offset-4">
              <ChevronLeft className="size-4" aria-hidden="true" /> All treatments
            </Link>
            <h1 className="mt-3 text-5xl md:text-6xl">{treatment.name}</h1>
            <p className="mt-4 text-lg text-muted md:text-xl">{treatment.shortDescription}</p>
            {treatment.duration && (
              <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[0.95rem] shadow-soft">
                <Clock className="size-4 text-teal-deep" aria-hidden="true" />
                <span className="font-semibold">Duration:</span> {treatment.duration}
              </p>
            )}
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <LinkButton href={bookHref} size="lg" icon={<CalendarCheck className="size-5" aria-hidden="true" />}>
                Book a consultation
              </LinkButton>
              <AnchorButton href={CLINIC.phoneHref} variant="outline" size="lg" icon={<Phone className="size-5" aria-hidden="true" />}>
                Call Now
              </AnchorButton>
            </div>
          </div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-[2rem_2rem_6rem_2rem] bg-green-soft shadow-lift animate-fade-up [animation-delay:80ms]">
            <Image
              src={treatment.imageUrl || TREATMENT_PLACEHOLDER}
              alt={`${treatment.name} at Kumar Ayurveda`}
              fill
              priority
              sizes="(min-width: 768px) 50vw, 100vw"
              className="object-cover"
            />
          </div>
        </div>
      </div>

      <div className="container-site grid gap-12 py-14 md:py-20 lg:grid-cols-[1.5fr_1fr]">
        <section aria-labelledby="about-treatment" data-reveal>
          <h2 id="about-treatment" className="text-4xl">About {treatment.name}</h2>
          <div className="prose-clinic mt-4 text-lg">
            {treatment.description.split(/\n{2,}/).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <p className="mt-8 rounded-2xl border border-saffron/50 bg-saffron-soft px-5 py-4 text-[0.95rem] text-ink">
            Suitability, number of sessions and duration are decided by your physician after consultation. Ayurvedic therapies
            support general wellbeing and are not a substitute for medical diagnosis or treatment.
          </p>
        </section>
        {treatment.benefits.length > 0 && (
          <aside aria-labelledby="benefits-title" className="lg:sticky lg:top-28 lg:self-start">
            <div data-reveal className="rounded-[var(--radius-card)] border border-line/70 bg-white p-6 shadow-soft">
              <h2 id="benefits-title" className="text-3xl">Traditionally used for</h2>
              <ul className="mt-4 space-y-3">
                {treatment.benefits.map((b) => (
                  <li key={b} className="flex gap-3">
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-teal-deep" aria-hidden="true" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <LinkButton href={bookHref} className="mt-6 w-full">
                Book Appointment
              </LinkButton>
            </div>
          </aside>
        )}
      </div>

      {related.length > 0 && (
        <Section tone="white" labelledBy="related-title">
          <div className="container-site">
            <SectionHeading id="related-title" title="Other treatments" />
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((t) => (
                <TreatmentCard key={t.id} treatment={t} />
              ))}
            </div>
          </div>
        </Section>
      )}
    </>
  );
}
