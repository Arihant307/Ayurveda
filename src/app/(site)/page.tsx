import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarCheck, HeartHandshake, Leaf, Phone, ShieldCheck, Sparkles, Stethoscope, Users } from "lucide-react";
import { CLINIC } from "@/lib/constants/clinic";
import { getActiveDoctors, getClinicHours, getPublishedTestimonials, getVisibleTreatments } from "@/lib/db/queries";
import { pageMetadata } from "@/lib/seo";
import { AnchorButton, LinkButton } from "@/components/ui/Button";
import { LeafSprig, Mandala, Wave } from "@/components/site/Botanical";
import { Section, SectionHeading } from "@/components/site/Section";
import { DoctorCard } from "@/components/site/DoctorCard";
import { TreatmentCard } from "@/components/site/TreatmentCard";
import { Testimonials } from "@/components/site/Testimonials";
import { BookingCta } from "@/components/site/BookingCta";
import { ContactList, DirectionsButton, MapEmbed } from "@/components/site/ContactDetails";
import { PANCHAKARMA_THERAPIES } from "@/components/site/panchakarma";

export const revalidate = 300;

export const metadata = pageMetadata({
  title: "Kumar Ayurveda — Ayurveda & Panchakarma Clinic in Jaipur",
  description:
    "Ayurveda clinic in Vaishali Nagar, Jaipur. Personalised Ayurvedic consultations, Panchakarma and classical therapies with Dr. Vijay Kumar and Dr. Jolly Sharma. Book online.",
  path: "/",
});

const PHILOSOPHY = [
  {
    title: "Prakriti — your nature",
    text: "Ayurveda sees every person as unique. Your constitution shapes how you digest, sleep, think and respond to the seasons.",
  },
  {
    title: "Balance of the doshas",
    text: "Vata, Pitta and Kapha describe the qualities at work in body and mind. Wellbeing, in Ayurveda, is the art of keeping them in balance.",
  },
  {
    title: "Agni — digestive fire",
    text: "Healthy digestion is central to Ayurveda. Much of our guidance begins with what, when and how you eat.",
  },
  {
    title: "Dinacharya — daily rhythm",
    text: "Small, consistent habits — waking, eating and resting in tune with nature — form the foundation of lasting wellbeing.",
  },
];

const WHY = [
  { Icon: Stethoscope, title: "Physician-led care", text: "Every plan begins with a one-to-one consultation with a qualified Ayurvedic doctor." },
  { Icon: Users, title: "Personalised, never generic", text: "Recommendations are based on your constitution, routine and health history." },
  { Icon: ShieldCheck, title: "Clean, careful practice", text: "Hygienic therapy rooms, quality oils and herbs, and clear explanations at every step." },
  { Icon: HeartHandshake, title: "Works with your doctor", text: "Ayurveda here complements your existing medical care — please keep your doctor informed." },
];

export default async function HomePage() {
  const [doctors, treatments, testimonials, hours] = await Promise.all([
    getActiveDoctors(),
    getVisibleTreatments(),
    getPublishedTestimonials(),
    getClinicHours(),
  ]);
  // Featured first, topped up with others so the grid fills evenly (Panchakarma has its own section).
  const pool = treatments.filter((t) => t.slug !== "panchakarma");
  const featured = [...pool.filter((t) => t.isFeatured), ...pool.filter((t) => !t.isFeatured)].slice(0, pool.length >= 6 ? 6 : 3);

  return (
    <>
      {/* ───────── Hero ───────── */}
      <section aria-labelledby="hero-title" className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <Mandala className="absolute -right-40 -top-32 size-[34rem] text-teal opacity-30 md:-right-24" />
          <LeafSprig animated className="absolute -bottom-6 right-[6%] hidden h-[22rem] text-teal opacity-40 lg:block" />
          <LeafSprig animated className="absolute -left-10 bottom-10 h-48 -scale-x-100 text-teal-dark opacity-15 [animation-delay:-4s]" />
        </div>
        <div className="container-site relative grid items-center gap-12 pb-16 pt-10 md:pb-24 md:pt-16 lg:grid-cols-[1.15fr_1fr]">
          <div>
            <p className="eyebrow animate-fade-up">Ayurveda &amp; Panchakarma · Vaishali Nagar, Jaipur</p>
            <h1 id="hero-title" className="mt-4 text-[2.75rem] leading-[1.02] sm:text-6xl lg:text-[4.4rem] animate-fade-up [animation-delay:60ms]">
              Holistic wellness, <span className="italic text-accent-gradient pr-1">rooted</span> in classical Ayurveda
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted md:text-xl animate-fade-up [animation-delay:120ms]">
              Personalised consultations and traditional therapies, including Panchakarma — offered with warmth, attention
              and modern clinical standards in the heart of Jaipur.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row animate-fade-up [animation-delay:180ms]">
              <LinkButton href="/book" size="lg" icon={<CalendarCheck className="size-5" aria-hidden="true" />}>
                Book Appointment
              </LinkButton>
              <AnchorButton href={CLINIC.phoneHref} variant="outline" size="lg" icon={<Phone className="size-5" aria-hidden="true" />}>
                Call Now
              </AnchorButton>
            </div>
            <p className="mt-5 text-sm text-muted animate-fade-up [animation-delay:220ms]">
              <span lang="sa" className="font-deva">स्वस्थस्य स्वास्थ्य रक्षणम्</span> — “to protect the health of the healthy” (Charaka Samhita)
            </p>
          </div>
          <div className="relative mx-auto w-full max-w-md lg:max-w-none animate-fade-up [animation-delay:120ms]">
            <div className="relative aspect-[4/5] overflow-hidden rounded-[2.5rem_2.5rem_10rem_2.5rem] bg-navy-soft shadow-lift">
              <Image
                src="/images/placeholders/clinic.svg"
                alt="Inside Kumar Ayurveda clinic"
                fill
                priority
                sizes="(min-width: 1024px) 480px, 90vw"
                className="object-cover"
              />
            </div>
            <div className="absolute -bottom-5 left-4 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-lift sm:-left-6">
              <span className="flex size-10 items-center justify-center rounded-full bg-teal-soft text-teal-dark">
                <Leaf className="size-5" aria-hidden="true" />
              </span>
              <span className="text-sm leading-tight">
                <span className="block font-semibold text-navy">{doctors.length} Ayurvedic physicians</span>
                <span className="text-muted">Personal consultations</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ───────── About teaser ───────── */}
      <Section tone="soft" labelledBy="about-title">
        <div className="container-site grid gap-10 md:grid-cols-2 md:items-center">
          <SectionHeading id="about-title" eyebrow="About Kumar Ayurveda" title="Care that sees the whole person">
            <p>
              At Kumar Ayurveda, we take time to understand you — your routine, your food, your sleep, your stresses — before
              recommending anything. Our physicians combine the wisdom of the classical texts with careful, modern clinical
              practice.
            </p>
          </SectionHeading>
          <div data-reveal className="space-y-4 text-lg">
            <p>
              Whether you are looking for guidance on everyday wellbeing, a seasonal routine, or a structured Panchakarma
              programme, you will receive a plan made for you and explained in plain language.
            </p>
            <Link href="/about" className="inline-flex items-center gap-1.5 font-semibold text-navy hover:underline underline-offset-4">
              Read our story <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </Section>

      {/* ───────── Philosophy ───────── */}
      <Section labelledBy="philosophy-title">
        <div className="container-site">
          <SectionHeading id="philosophy-title" eyebrow="The Ayurvedic view" title="An ancient science of everyday living" align="center">
            Ayurveda — the “knowledge of life” — focuses on maintaining balance in body, mind and routine.
          </SectionHeading>
          <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {PHILOSOPHY.map((p, i) => (
              <li key={p.title} data-reveal style={{ transitionDelay: `${i * 70}ms` }} className="relative rounded-[var(--radius-card)] border border-line/70 bg-white p-6">
                <span className="font-serif text-4xl font-semibold text-teal" aria-hidden="true">
                  0{i + 1}
                </span>
                <h3 className="mt-2 text-2xl">{p.title}</h3>
                <p className="mt-2 text-muted">{p.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </Section>

      {/* ───────── Featured treatments ───────── */}
      <Section tone="soft" labelledBy="treatments-title">
        <div className="container-site">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <SectionHeading id="treatments-title" eyebrow="Therapies" title="Treatments we offer">
              Classical Ayurvedic therapies, each recommended only after consultation.
            </SectionHeading>
            <LinkButton href="/treatments" variant="ghost" icon={<ArrowRight className="size-4" aria-hidden="true" />} className="self-start md:self-auto">
              All treatments
            </LinkButton>
          </div>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((t) => (
              <TreatmentCard key={t.id} treatment={t} />
            ))}
          </div>
        </div>
      </Section>

      {/* ───────── Panchakarma highlight ───────── */}
      <section aria-labelledby="pk-title" className="relative">
        <Wave className="text-navy" />
        <div className="relative overflow-hidden bg-navy py-16 text-white md:py-24">
          <Mandala className="absolute -left-32 top-10 size-96 text-teal opacity-25" />
          <div className="container-site relative grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <SectionHeading id="pk-title" eyebrow="Signature programme" title="Panchakarma in Jaipur" onDark>
                The classical five-fold cleansing and rejuvenation programme of Ayurveda — planned individually and supervised
                by our physicians from preparation to recovery.
              </SectionHeading>
              <div data-reveal className="mt-8 flex flex-col gap-3 sm:flex-row">
                <LinkButton href="/panchakarma" variant="light" icon={<Sparkles className="size-4" aria-hidden="true" />}>
                  Explore Panchakarma
                </LinkButton>
                <LinkButton
                  href="/book?treatment=panchakarma"
                  className="border-2 border-white/40 bg-transparent text-white hover:bg-white/10"
                >
                  Book a Panchakarma consultation
                </LinkButton>
              </div>
            </div>
            <ol className="grid gap-3 sm:grid-cols-2">
              {PANCHAKARMA_THERAPIES.map((t, i) => (
                <li key={t.name} data-reveal style={{ transitionDelay: `${i * 60}ms` }} className="rounded-2xl border border-white/15 bg-white/5 p-5">
                  <p className="font-serif text-2xl font-semibold text-white">
                    {t.name} <span lang="hi" className="ml-1 font-deva text-base font-normal text-on-navy-muted">{t.hindi}</span>
                  </p>
                  <p className="mt-1 text-[0.95rem] text-on-navy-muted">{t.short}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <Wave className="text-navy" flip />
      </section>

      {/* ───────── Doctors ───────── */}
      <Section labelledBy="doctors-title">
        <div className="container-site">
          <SectionHeading id="doctors-title" eyebrow="Our physicians" title="Meet our doctors" align="center">
            Unhurried consultations with experienced Ayurvedic physicians.
          </SectionHeading>
          <div className="mx-auto mt-12 grid max-w-4xl gap-6 sm:grid-cols-2">
            {doctors.map((d) => (
              <DoctorCard key={d.id} doctor={d} />
            ))}
          </div>
        </div>
      </Section>

      {/* ───────── Why choose us ───────── */}
      <Section tone="soft" labelledBy="why-title">
        <div className="container-site">
          <SectionHeading id="why-title" eyebrow="Why Kumar Ayurveda" title="Traditional wisdom, careful practice" />
          <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {WHY.map(({ Icon, title, text }, i) => (
              <li key={title} data-reveal style={{ transitionDelay: `${i * 70}ms` }}>
                <span className="flex size-12 items-center justify-center rounded-2xl bg-white text-teal-dark shadow-soft">
                  <Icon className="size-6" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-2xl">{title}</h3>
                <p className="mt-2 text-muted">{text}</p>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Testimonials items={testimonials} />

      <BookingCta />

      {/* ───────── Map + contact ───────── */}
      <Section tone="soft" labelledBy="visit-title">
        <div className="container-site grid gap-10 lg:grid-cols-[1fr_1.3fr] lg:items-stretch">
          <div>
            <SectionHeading id="visit-title" eyebrow="Visit us" title="Find the clinic">
              Near Amrapali Circle in Vaishali Nagar, Jaipur.
            </SectionHeading>
            <div data-reveal className="mt-8">
              <ContactList hours={hours.groups} />
              <div className="mt-8">
                <DirectionsButton />
              </div>
            </div>
          </div>
          <MapEmbed className="min-h-[360px]" />
        </div>
      </Section>
    </>
  );
}
