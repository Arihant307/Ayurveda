import Image from "next/image";
import { Compass, HeartHandshake, Leaf, Microscope } from "lucide-react";
import { pageMetadata } from "@/lib/seo";
import { PageHero, Section, SectionHeading } from "@/components/site/Section";
import { LeafSprig } from "@/components/site/Botanical";
import { BookingCta } from "@/components/site/BookingCta";

export const revalidate = 3600;

export const metadata = pageMetadata({
  title: "About the Clinic",
  description:
    "Kumar Ayurveda is an Ayurveda and Panchakarma clinic in Vaishali Nagar, Jaipur. Learn about our holistic, personalised and patient-focused approach.",
  path: "/about",
});

const PILLARS = [
  {
    Icon: Compass,
    title: "Holistic",
    text: "We look at the whole picture — body, mind, food, sleep, work and season — rather than a single symptom in isolation.",
  },
  {
    Icon: Leaf,
    title: "Personalised",
    text: "No two plans are alike. Recommendations follow your constitution (prakriti), your current state and what is realistic for your life.",
  },
  {
    Icon: HeartHandshake,
    title: "Patient-focused",
    text: "Unhurried consultations, clear explanations and respect for your choices. You are a partner in every decision.",
  },
  {
    Icon: Microscope,
    title: "Clinically careful",
    text: "Traditional therapies delivered with modern standards of hygiene, documentation and safety — and alongside, never instead of, your existing medical care.",
  },
];

export default function AboutPage() {
  return (
    <>
      <PageHero eyebrow="About us" title={<>A clinic built on <span className="italic text-accent-gradient pr-1">listening</span></>}>
        Kumar Ayurveda brings the classical science of Ayurveda to Vaishali Nagar, Jaipur — practised with patience,
        personal attention and modern clinical care.
      </PageHero>

      <Section tone="white" className="overflow-hidden">
        <div className="container-site grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-start">
          <div data-reveal className="relative">
            <div className="relative aspect-[4/5] overflow-hidden rounded-[2rem_8rem_2rem_2rem] bg-navy-soft shadow-soft">
              <Image src="/images/placeholders/clinic.svg" alt="The consultation room at Kumar Ayurveda" fill sizes="(min-width: 1024px) 520px, 100vw" className="object-cover" />
            </div>
            <LeafSprig className="absolute -bottom-10 -right-6 h-40 text-teal-dark opacity-30" />
          </div>
          <div className="prose-clinic text-lg" data-reveal>
            <p className="eyebrow">Our story</p>
            <h2 className="!mt-3 text-4xl md:text-5xl">Ayurveda, the way it was meant to be practised</h2>
            <p className="mt-5">
              Kumar Ayurveda was founded with a simple belief: that good Ayurvedic care begins with time. Time to listen to a
              patient’s story, to understand their daily rhythm, and to explain — in plain words — what Ayurveda suggests and why.
            </p>
            <p>
              Our physicians, Dr. Vijay Kumar and Dr. Jolly Sharma, see patients from across Jaipur at our clinic near Amrapali
              Circle. Some come for guidance on diet and routine; others for classical therapies such as Abhyanga and
              Shirodhara, or for a structured Panchakarma programme.
            </p>
            <p>
              Whatever brings you to us, you can expect the same approach: a careful consultation, a plan made for you, and a
              team that keeps you informed at every step.
            </p>
            <h3>Traditional roots, modern standards</h3>
            <p>
              We follow the principles of the classical texts — Charaka, Sushruta and Vagbhata — while holding ourselves to
              today’s expectations of hygiene, record-keeping and patient safety. We encourage every patient to continue care
              with their existing doctors and to keep them informed.
            </p>
          </div>
        </div>
      </Section>

      <Section tone="soft" labelledBy="approach-title">
        <div className="container-site">
          <SectionHeading id="approach-title" eyebrow="Our approach" title="Four things we never compromise on" align="center" />
          <ul className="mt-12 grid gap-6 sm:grid-cols-2">
            {PILLARS.map(({ Icon, title, text }, i) => (
              <li key={title} data-reveal style={{ transitionDelay: `${i * 70}ms` }} className="flex gap-5 rounded-[var(--radius-card)] border border-line/70 bg-white p-6 md:p-8">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-teal-soft text-teal-dark">
                  <Icon className="size-6" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-2xl">{title}</h3>
                  <p className="mt-2 text-muted">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section tone="white" labelledBy="visit-expect">
        <div className="container-site max-w-3xl">
          <SectionHeading id="visit-expect" eyebrow="Your first visit" title="What to expect" />
          <ol className="mt-8 space-y-6" data-reveal>
            {[
              ["Conversation", "Your physician asks about your health history, routine, diet, sleep and concerns."],
              ["Assessment", "A traditional Ayurvedic assessment, including pulse examination (nadi pariksha)."],
              ["Your plan", "A clear, written plan — diet and routine guidance, and therapies only where suitable."],
              ["Follow-up", "Regular reviews to see what is working and adjust what isn’t."],
            ].map(([title, text], i) => (
              <li key={title} className="flex gap-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-navy font-semibold text-white">{i + 1}</span>
                <div>
                  <h3 className="text-2xl">{title}</h3>
                  <p className="mt-1 text-muted">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Section>

      <BookingCta />
    </>
  );
}
