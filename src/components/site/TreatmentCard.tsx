import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Clock } from "lucide-react";
import type { Treatment } from "@prisma/client";

export const TREATMENT_PLACEHOLDER = "/images/placeholders/treatment-1.svg";

export function TreatmentCard({ treatment, headingLevel = "h3" }: { treatment: Treatment; headingLevel?: "h2" | "h3" }) {
  const H = headingLevel;
  return (
    <article
      data-reveal
      className="card-accent lift group relative flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line/70 bg-white shadow-soft"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-navy-soft">
        <Image
          src={treatment.imageUrl || TREATMENT_PLACEHOLDER}
          alt=""
          fill
          sizes="(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw"
          className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.05]"
        />
        {treatment.duration && (
          <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-navy shadow-soft">
            <Clock className="size-3.5 text-teal-dark" aria-hidden="true" />
            {treatment.duration}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-6">
        <H className="text-2xl">
          <Link href={`/treatments/${treatment.slug}`} className="after:absolute after:inset-0 after:content-[''] hover:text-navy-dark">
            {treatment.name}
          </Link>
        </H>
        <p className="mt-2 text-muted">{treatment.shortDescription}</p>
        <div className="mt-auto flex items-center justify-between gap-3 pt-5 text-sm">
          <span className="font-semibold text-navy" aria-hidden="true">
            Learn more
          </span>
          <span
            className="flex size-9 items-center justify-center rounded-full bg-navy-soft text-navy transition-colors duration-300 group-hover:bg-navy group-hover:text-white"
            aria-hidden="true"
          >
            <ArrowUpRight className="size-4 transition-transform duration-300 group-hover:rotate-45" />
          </span>
        </div>
      </div>
    </article>
  );
}
