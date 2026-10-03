"use client";

import { usePathname } from "next/navigation";
import { CalendarCheck, Phone } from "lucide-react";
import Link from "next/link";
import { CLINIC } from "@/lib/constants/clinic";

/** Sticky call/book bar on small screens (hidden inside the booking flow). */
export function MobileCallBar() {
  const pathname = usePathname();
  if (pathname.startsWith("/book")) return null;
  return (
    <>
      <div className="h-[4.25rem] sm:hidden" aria-hidden="true" />
      <div className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-2 gap-2 border-t border-line bg-white px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:hidden">
        <a
          href={CLINIC.phoneHref}
          className="flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-navy font-semibold text-navy active:scale-[0.97] transition-transform"
        >
          <Phone className="size-4" aria-hidden="true" /> Call Now
        </a>
        <Link
          href="/book"
          className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-navy font-semibold text-white active:scale-[0.97] transition-transform"
        >
          <CalendarCheck className="size-4" aria-hidden="true" /> Book
        </Link>
      </div>
    </>
  );
}
