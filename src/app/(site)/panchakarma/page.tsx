import { CalendarCheck, ClipboardList, Droplets, Sprout, Sun } from "lucide-react";
import { pageMetadata } from "@/lib/seo";
import { PageHero, Section, SectionHeading } from "@/components/site/Section";
import { LinkButton } from "@/components/ui/Button";
import { BookingCta } from "@/components/site/BookingCta";
import { Mandala } from "@/components/site/Botanical";
import { PANCHAKARMA_THERAPIES } from "@/components/site/panchakarma";

export const revalidate = 3600;

export const metadata = pageMetadata({
  title: "Panchakarma in Jaipur — The Five Classical Therapies",
  description:
    "Panchakarma at Kumar Ayurveda, Vaishali Nagar, Jaipur: the five classical therapies, the process, how to prepare and what to expect. Physician-supervised and planned individually.",
  path: "/panchakarma",
});

const PROCESS = [
  {
    Icon: ClipboardList,
    phase: "Consultation",
    title: "Assessment & planning",
    text: "A detailed consultation to understand your constitution, health history and goals. Your physician decides whether Panchakarma is suitable, which procedures to include and for how long.",
  },
  {
    Icon: Droplets,
    phase: "Purvakarma",
    title: "Preparation",
    text: "Internal oleation (snehapana) with medicated ghee or oil, external oil massage (abhyanga) and herbal steam (svedana) over several days, alongside a light diet.",
  },
  {
    Icon: Sun,
    phase: "Pradhanakarma",
    title: "Main procedures",
    text: "The selected classical procedures, carried out in a calm setting by trained therapists under the supervision of your physician.",
  },
  {
    Icon: Sprout,
    phase: "Paschatkarma",
    title: "Recovery",
    text: "A graded return to normal food (samsarjana krama) and gentle routine guidance, so that the body is eased back into everyday life.",
  },
];

const PREPARE = [
  "Book a consultation first — Panchakarma is always planned individually.",
  "Bring recent reports and a list of all medicines and supplements you take.",
  "Plan lighter work and social commitments during the programme where possible.",
  "Expect a simple, easily digestible diet; your physician will guide you day by day.",
  "Wear comfortable clothing; avoid strenuous exercise, late nights and travel during the programme.",
  "Tell us about pregnancy, recent surgery or any ongoing treatment before starting.",
];

const EXPECT = [
  ["Daily visits", "Most programmes involve visiting the clinic every day for a few hours."],
  ["Individual attention", "Your physician reviews you regularly and adjusts the plan as needed."],
  ["A calm environment", "Therapies take place in clean, private rooms with trained therapists."],
  ["Honest guidance", "If Panchakarma is not suitable for you right now, we will tell you — and suggest alternatives."],
];

export default function PanchakarmaPage() {
  return (
    <>
      <PageHero eyebrow="Signature programme" title={<>Panchakarma in <span className="italic text-accent-gradient pr-1">Jaipur</span></>}
        aside={
          <div className="hidden justify-center md:flex" aria-hidden="true">
            <Mandala className="size-72 text-teal opacity-60" />
          </div>
        }>
        Panchakarma — “five actions” — is Ayurveda’s classical programme of cleansing and rejuvenation. At Kumar Ayurveda it
        is planned individually and supervised by our physicians from the first consultation to the last day of recovery.
      </PageHero>

      <Section tone="white" labelledBy="five-title">
        <div className="container-site">
          <SectionHeading id="five-title" eyebrow="Pancha · Karma" title="The five classical therapies">
            Not every programme includes all five. Your physician selects what is appropriate for you.
          </SectionHeading>
          <ol className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {PANCHAKARMA_THERAPIES.map((t, i) => (
              <li key={t.name} data-reveal style={{ transitionDelay: `${i * 60}ms` }} className="rounded-[var(--radius-card)] border border-line/70 bg-soft p-6">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-3xl">{t.name}</h3>
                  <span lang="hi" className="font-deva text-lg text-teal-dark">{t.hindi}</span>
                </div>
                <p className="mt-1 font-semibold text-navy">{t.short}</p>
                <p className="mt-3 text-muted">{t.detail}</p>
              </li>
            ))}
          </ol>
        </div>
      </Section>

      <Section tone="soft" labelledBy="process-title">
        <div className="container-site">
          <SectionHeading id="process-title" eyebrow="The process" title="How a Panchakarma programme unfolds" align="center" />
          <ol className="relative mx-auto mt-12 max-w-3xl space-y-8 before:absolute before:bottom-4 before:left-6 before:top-4 before:w-px before:bg-line">
            {PROCESS.map(({ Icon, phase, title, text }) => (
              <li key={phase} data-reveal className="relative flex gap-5">
                <span className="relative z-10 flex size-12 shrink-0 items-center justify-center rounded-full bg-navy text-white shadow-soft">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <div className="rounded-[var(--radius-card)] border border-line/70 bg-white p-5 md:p-6">
                  <p className="eyebrow">{phase}</p>
                  <h3 className="mt-1 text-2xl">{title}</h3>
                  <p className="mt-2 text-muted">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Section>

      <Section tone="white">
        <div className="container-site grid gap-12 lg:grid-cols-2">
          <section aria-labelledby="prep-title">
            <SectionHeading id="prep-title" eyebrow="Before you begin" title="How to prepare" />
            <ul className="mt-6 space-y-3" data-reveal>
              {PREPARE.map((p) => (
                <li key={p} className="flex gap-3">
                  <span className="mt-2.5 size-2 shrink-0 rounded-full bg-teal" aria-hidden="true" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="expect-title">
            <SectionHeading id="expect-title" eyebrow="During the programme" title="What to expect" />
            <dl className="mt-6 grid gap-4 sm:grid-cols-2" data-reveal>
              {EXPECT.map(([t, d]) => (
                <div key={t} className="rounded-2xl bg-soft p-5">
                  <dt className="font-serif text-xl font-semibold text-navy">{t}</dt>
                  <dd className="mt-1 text-muted">{d}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
        <div className="container-site mt-12">
          <p className="rounded-2xl border border-teal/50 bg-soft px-5 py-4 text-[0.95rem]">
            Panchakarma is a traditional wellbeing programme. It is not suitable for everyone and is not a substitute for medical
            diagnosis or treatment. Please continue any prescribed medicines unless your own doctor advises otherwise.
          </p>
          <div className="mt-8 text-center">
            <LinkButton href="/book?treatment=panchakarma" size="lg" icon={<CalendarCheck className="size-5" aria-hidden="true" />}>
              Book a Panchakarma consultation
            </LinkButton>
          </div>
        </div>
      </Section>

      <BookingCta href="/book?treatment=panchakarma" />
    </>
  );
}
