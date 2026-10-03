import { Quote, Star } from "lucide-react";
import type { Testimonial } from "@prisma/client";
import { EmptyState } from "@/components/ui/EmptyState";
import { Section, SectionHeading } from "./Section";

export function Testimonials({ items }: { items: Testimonial[] }) {
  return (
    <Section tone="white" labelledBy="testimonials-title">
      <div className="container-site">
        <SectionHeading id="testimonials-title" eyebrow="Patient voices" title="In our patients' words" align="center">
          Experiences shared by people who have visited Kumar Ayurveda.
        </SectionHeading>
        {items.length === 0 ? (
          <EmptyState
            className="mx-auto mt-10 max-w-xl"
            title="Patient stories coming soon"
            icon={<Quote className="size-6" aria-hidden="true" />}
          >
            We only share experiences from real patients, with their permission. If you have visited us, we would love to
            hear from you.
          </EmptyState>
        ) : (
          <ul className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {items.map((t) => (
              <li key={t.id} data-reveal>
                <figure className="flex h-full flex-col rounded-[var(--radius-card)] border border-line/70 bg-cream p-6">
                  <Quote className="size-8 text-teal" aria-hidden="true" />
                  {t.rating ? (
                    <div className="mt-3 flex gap-0.5" role="img" aria-label={`${t.rating} out of 5 stars`}>
                      {Array.from({ length: 5 }, (_, i) => (
                        <Star key={i} className={i < t.rating! ? "size-4 fill-saffron text-saffron" : "size-4 text-line"} aria-hidden="true" />
                      ))}
                    </div>
                  ) : null}
                  <blockquote className="mt-3 flex-1 text-[1.05rem] leading-relaxed">“{t.content}”</blockquote>
                  <figcaption className="mt-5 border-t border-line pt-4">
                    <span className="block font-semibold text-green">{t.patientName}</span>
                    {t.context && <span className="text-sm text-muted">{t.context}</span>}
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}
