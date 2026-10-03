import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck, CheckCircle2, ChevronLeft, Clock, Phone } from "lucide-react";
import { CLINIC } from "@/lib/constants/clinic";
import { getDoctorBySlug } from "@/lib/db/queries";
import { summariseTimings } from "@/lib/availability/engine";
import { formatDayGroup, formatSessions } from "@/lib/format";
import { breadcrumbJsonLd, pageMetadata, physicianJsonLd } from "@/lib/seo";
import { AnchorButton, LinkButton } from "@/components/ui/Button";
import { DoctorPhoto } from "@/components/site/DoctorCard";
import { JsonLd } from "@/components/site/JsonLd";
import { Mandala } from "@/components/site/Botanical";

export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const doctor = await getDoctorBySlug((await params).slug);
  if (!doctor) return { title: "Doctor not found" };
  return pageMetadata({
    title: `${doctor.name} — Ayurvedic Doctor, Vaishali Nagar`,
    description: `${doctor.name}${doctor.specialization ? `, ${doctor.specialization}` : ""} at Kumar Ayurveda, Vaishali Nagar, Jaipur. View consultation timings and book an appointment online.`,
    path: `/doctors/${doctor.slug}`,
    image: doctor.photoUrl,
  });
}

export default async function DoctorPage({ params }: Props) {
  const doctor = await getDoctorBySlug((await params).slug);
  if (!doctor) notFound();
  const timings = summariseTimings(doctor.availability);

  return (
    <>
      <JsonLd
        data={[
          physicianJsonLd(doctor),
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Doctors", path: "/doctors" },
            { name: doctor.name, path: `/doctors/${doctor.slug}` },
          ]),
        ]}
      />
      <div className="relative overflow-hidden bg-soft">
        <Mandala className="absolute -right-32 -top-32 size-96 text-teal opacity-25" />
        <div className="container-site relative py-8 md:py-14">
          <Link href="/doctors" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-navy hover:underline underline-offset-4">
            <ChevronLeft className="size-4" aria-hidden="true" /> All doctors
          </Link>
          <div className="mt-4 grid gap-10 md:grid-cols-[minmax(0,360px)_1fr] md:items-center">
            <div className="relative mx-auto aspect-[5/6] w-full max-w-sm overflow-hidden rounded-[2rem] bg-navy-soft shadow-lift animate-fade-up">
              <DoctorPhoto doctor={doctor} sizes="(min-width: 768px) 360px, 90vw" priority />
            </div>
            <div className="animate-fade-up [animation-delay:80ms]">
              <p className="eyebrow">Ayurvedic physician</p>
              <h1 className="mt-3 text-5xl md:text-6xl">{doctor.name}</h1>
              {doctor.qualification && <p className="mt-3 text-lg font-semibold text-navy">{doctor.qualification}</p>}
              {doctor.specialization && <p className="mt-1 text-lg text-muted">{doctor.specialization}</p>}
              {doctor.experience && (
                <p className="mt-1 text-muted">
                  <span className="font-semibold text-ink">Experience:</span> {doctor.experience}
                </p>
              )}
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <LinkButton href={`/book?doctor=${doctor.slug}`} size="lg" icon={<CalendarCheck className="size-5" aria-hidden="true" />}>
                  Book with {doctor.name}
                </LinkButton>
                <AnchorButton href={CLINIC.phoneHref} variant="outline" size="lg" icon={<Phone className="size-5" aria-hidden="true" />}>
                  Call to enquire
                </AnchorButton>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container-site grid gap-10 py-14 md:py-20 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-12">
          {doctor.bio && (
            <section aria-labelledby="bio-title" data-reveal>
              <h2 id="bio-title" className="text-4xl">About {doctor.name}</h2>
              <div className="prose-clinic mt-4 text-lg">
                {doctor.bio.split(/\n{2,}/).map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </section>
          )}
          {doctor.expertise.length > 0 && (
            <section aria-labelledby="expertise-title" data-reveal>
              <h2 id="expertise-title" className="text-4xl">Areas of expertise</h2>
              <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                {doctor.expertise.map((e) => (
                  <li key={e} className="flex gap-3 rounded-2xl border border-line/70 bg-white p-4">
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-teal-dark" aria-hidden="true" />
                    <span>{e}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside aria-labelledby="timings-title" className="lg:sticky lg:top-28 lg:self-start">
          <div data-reveal className="rounded-[var(--radius-card)] border border-line/70 bg-white p-6 shadow-soft">
            <h2 id="timings-title" className="flex items-center gap-2 text-3xl">
              <Clock className="size-6 text-teal-dark" aria-hidden="true" /> Consultation timings
            </h2>
            <dl className="mt-5 divide-y divide-line">
              {timings.map((g) => (
                <div key={g.days.join()} className="py-3">
                  <dt className="font-semibold">{formatDayGroup(g.days)}</dt>
                  <dd className={g.sessions.length ? "text-muted" : "text-danger"}>{formatSessions(g.sessions)}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-sm text-muted">Timings may change on holidays. Online booking shows live availability.</p>
            <LinkButton href={`/book?doctor=${doctor.slug}`} className="mt-5 w-full">
              See available times
            </LinkButton>
          </div>
        </aside>
      </div>
    </>
  );
}
