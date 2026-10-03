"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight, Phone } from "lucide-react";
import type { AppointmentDTO } from "@/lib/db/admin";
import { formatDateStringMedium, formatTimeString } from "@/lib/datetime";
import { StatusBadge } from "./StatusBadge";

/** Link that opens the appointment drawer on the current page. */
export function useDrawerHref() {
  const pathname = usePathname();
  const params = useSearchParams();
  return (id: string) => {
    const next = new URLSearchParams(params);
    next.set("id", id);
    return `${pathname}?${next}`;
  };
}

export function AppointmentTable({ items, showDate = true }: { items: AppointmentDTO[]; showDate?: boolean }) {
  const href = useDrawerHref();
  return (
    <>
      {/* Phones: cards */}
      <ul className="space-y-3 md:hidden">
        {items.map((a) => (
          <li key={a.id}>
            <Link href={href(a.id)} scroll={false} className="block rounded-2xl border border-line/70 bg-white p-4 shadow-soft active:scale-[0.99] transition-transform">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-serif text-2xl font-semibold leading-tight text-green">{formatTimeString(a.time)}</p>
                  {showDate && <p className="text-sm text-muted">{formatDateStringMedium(a.date)}</p>}
                </div>
                <StatusBadge status={a.status} />
              </div>
              <p className="mt-2 text-lg font-semibold">{a.patientName}</p>
              <p className="text-sm text-muted">
                {a.doctor.name} · {a.typeLabel}
              </p>
              <p className="mt-1 flex items-center justify-between text-sm">
                <span className="inline-flex items-center gap-1 text-muted">
                  <Phone className="size-3.5" aria-hidden="true" /> {a.patientPhone}
                </span>
                <span className="font-mono text-xs text-muted">{a.code}</span>
              </p>
            </Link>
          </li>
        ))}
      </ul>

      {/* Tablets and up: table */}
      <div className="hidden overflow-hidden rounded-[var(--radius-card)] border border-line/70 bg-white shadow-soft md:block">
        <table className="w-full text-left text-[0.95rem]">
          <thead className="border-b border-line bg-cream text-sm text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">{showDate ? "Date & time" : "Time"}</th>
              <th scope="col" className="px-4 py-3 font-semibold">Patient</th>
              <th scope="col" className="px-4 py-3 font-semibold">Doctor</th>
              <th scope="col" className="hidden px-4 py-3 font-semibold lg:table-cell">Type</th>
              <th scope="col" className="px-4 py-3 font-semibold">Status</th>
              <th scope="col" className="px-4 py-3"><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((a) => (
              <tr key={a.id} className="group relative hover:bg-green-soft/40">
                <td className="px-4 py-3">
                  <span className="font-semibold">{formatTimeString(a.time)}</span>
                  {showDate && <span className="block text-sm text-muted">{formatDateStringMedium(a.date)}</span>}
                </td>
                <td className="px-4 py-3">
                  <Link href={href(a.id)} scroll={false} className="font-semibold text-ink after:absolute after:inset-0 after:content-[''] hover:text-green">
                    {a.patientName}
                  </Link>
                  <span className="block text-sm text-muted">
                    {a.patientPhone} · <span className="font-mono text-xs">{a.code}</span>
                  </span>
                </td>
                <td className="px-4 py-3">{a.doctor.name}</td>
                <td className="hidden px-4 py-3 lg:table-cell">{a.typeLabel}</td>
                <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                <td className="px-4 py-3 text-right text-muted"><ChevronRight className="ml-auto size-5" aria-hidden="true" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
