import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarCheck } from "lucide-react";
import type { Doctor } from "@prisma/client";
import { LinkButton } from "@/components/ui/Button";

export const DOCTOR_PLACEHOLDER = "/images/placeholders/doctor.svg";

export function DoctorPhoto({ doctor, sizes, priority }: { doctor: Pick<Doctor, "name" | "photoUrl">; sizes: string; priority?: boolean }) {
  return (
    <Image
      src={doctor.photoUrl || DOCTOR_PLACEHOLDER}
      alt={doctor.photoUrl ? `Portrait of ${doctor.name}` : `Photo of ${doctor.name} coming soon`}
      fill
      sizes={sizes}
      priority={priority}
      className="object-cover"
    />
  );
}

export function DoctorCard({ doctor }: { doctor: Doctor }) {
  return (
    <article
      data-reveal
      className="card-accent lift group flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line/70 bg-white shadow-soft"
    >
      <Link href={`/doctors/${doctor.slug}`} className="relative block aspect-[5/6] overflow-hidden bg-navy-soft" tabIndex={-1} aria-hidden="true">
        <span className="absolute inset-0 transition-transform duration-700 ease-out group-hover:scale-[1.04]">
          <DoctorPhoto doctor={doctor} sizes="(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw" />
        </span>
        <span className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-navy/10 to-transparent" />
      </Link>
      <div className="flex flex-1 flex-col p-6">
        <h3 className="text-[1.75rem]">
          <Link href={`/doctors/${doctor.slug}`} className="hover:text-navy-dark">
            {doctor.name}
          </Link>
        </h3>
        {doctor.qualification && <p className="mt-1 font-semibold text-navy">{doctor.qualification}</p>}
        {doctor.specialization && <p className="mt-1 text-muted">{doctor.specialization}</p>}
        {doctor.experience && <p className="mt-1 text-sm text-muted">Experience: {doctor.experience}</p>}
        {doctor.expertise.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2" aria-label="Areas of expertise">
            {doctor.expertise.slice(0, 2).map((e) => (
              <li key={e} className="rounded-full bg-teal-soft px-3 py-1 text-xs font-semibold text-teal-dark">
                {e}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-3 pt-6">
          <LinkButton href={`/book?doctor=${doctor.slug}`} size="sm" icon={<CalendarCheck className="size-4" aria-hidden="true" />}>
            Book appointment<span className="sr-only"> with {doctor.name}</span>
          </LinkButton>
          <Link href={`/doctors/${doctor.slug}`} className="inline-flex items-center gap-1 text-sm font-semibold text-navy hover:underline underline-offset-4">
            View profile <ArrowRight className="size-4" aria-hidden="true" />
            <span className="sr-only"> of {doctor.name}</span>
          </Link>
        </div>
      </div>
    </article>
  );
}
