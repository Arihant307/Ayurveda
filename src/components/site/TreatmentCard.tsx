import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";
import type { Treatment } from "@prisma/client";

export const TREATMENT_PLACEHOLDER = "/images/placeholders/treatment-1.svg";

export function TreatmentCard({ treatment, headingLevel = "h3" }: { treatment: Treatment; headingLevel?: "h2" | "h3" }) {
  const H = headingLevel;
  return (
    <article data-reveal className="lift group relative flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line/70 bg-white shadow-soft">
      <div className="relative aspect-[4/3] overflow-hidden bg-green-soft">
        <Image
          src={treatment.imageUrl || TREATMENT_PLACEHOLDER}
          alt=""
          fill
          sizes="(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      </div>
      <div className="flex flex-1 flex-col p-6">
        <H className="text-2xl">
          <Link href={`/treatments/${treatment.slug}`} className="after:absolute after:inset-0 after:content-[''] hover:text-green-deep">
            {treatment.name}
          </Link>
        </H>
        <p className="mt-2 text-muted">{treatment.shortDescription}</p>
        <div className="mt-auto flex items-center justify-between gap-3 pt-5 text-sm">
          {treatment.duration ? (
            <span className="inline-flex items-center gap-1.5 text-muted">
              <Clock className="size-4 text-teal-deep" aria-hidden="true" />
              {treatment.duration}
            </span>
          ) : (
            <span />
          )}
          <span className="inline-flex items-center gap-1 font-semibold text-green" aria-hidden="true">
            Learn more <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </article>
  );
}
