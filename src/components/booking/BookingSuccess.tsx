"use client";

import { CalendarPlus, Navigation, Phone } from "lucide-react";
import { CLINIC, CLINIC_ADDRESS_ONE_LINE, MAPS_DIRECTIONS_URL } from "@/lib/constants/clinic";
import { formatDateLong, formatTime } from "@/lib/datetime";
import { buildAppointmentIcs, downloadIcs } from "@/lib/ics";
import { AnchorButton, Button, LinkButton } from "@/components/ui/Button";
import { useEffect, useRef } from "react";

export type BookingResult = {
  code: string;
  startsAt: string;
  endsAt: string;
  status: string;
  typeLabel: string;
  doctor: { name: string; slug: string };
  treatment: { name: string } | null;
  patient: { name: string; phone: string; email: string | null };
};

export function BookingSuccess({ result }: { result: BookingResult }) {
  const start = new Date(result.startsAt);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);

  const addToCalendar = () =>
    downloadIcs(
      `kumar-ayurveda-${result.code}.ics`,
      buildAppointmentIcs({
        code: result.code,
        startsAt: start,
        endsAt: new Date(result.endsAt),
        doctorName: result.doctor.name,
        typeLabel: result.typeLabel,
      }),
    );

  const rows: [string, string][] = [
    ["Doctor", result.doctor.name],
    ["Date", formatDateLong(start)],
    ["Time", formatTime(start)],
    ["Type", result.typeLabel],
    ...(result.treatment ? ([["Treatment", result.treatment.name]] as [string, string][]) : []),
    ["Name", result.patient.name],
    ["Mobile", result.patient.phone],
    ["Address", CLINIC_ADDRESS_ONE_LINE],
  ];

  return (
    <div className="text-center">
      <div className="mx-auto flex size-24 items-center justify-center rounded-full bg-navy-soft animate-pop">
        <svg viewBox="0 0 52 52" className="size-14 text-navy" aria-hidden="true">
          <defs>
            {/* Logo accent: magenta → violet (colours come from the CSS tokens) */}
            <linearGradient id="check-accent" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" style={{ stopColor: "var(--brand-magenta)" }} />
              <stop offset="100%" style={{ stopColor: "var(--brand-violet)" }} />
            </linearGradient>
          </defs>
          <circle cx="26" cy="26" r="24" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
          <path className="draw-check" d="M15 27l7 7 15-16" fill="none" stroke="url(#check-accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 ref={heading} tabIndex={-1} className="mt-6 text-4xl outline-none sm:text-5xl animate-fade-up">
        Your appointment is booked
      </h2>
      <p className="mx-auto mt-3 max-w-md text-lg text-muted animate-fade-up [animation-delay:80ms]">
        Thank you, {result.patient.name.split(" ")[0]}. Our team may call you to confirm.
        {result.patient.email && " A confirmation email is on its way."}
      </p>

      <div className="mx-auto mt-8 max-w-lg rounded-[var(--radius-card)] border border-line/70 bg-white text-left shadow-soft animate-fade-up [animation-delay:140ms]">
        <div className="flex flex-col items-center gap-1 border-b border-dashed border-line px-6 py-5 text-center">
          <span className="text-sm font-bold uppercase tracking-[0.14em] text-muted">Appointment ID</span>
          <span className="font-mono text-3xl font-bold tracking-wider text-navy" aria-label={`Appointment ID ${result.code.split("").join(" ")}`}>
            {result.code}
          </span>
          <span className="text-sm text-muted">Please quote this if you call us.</span>
        </div>
        <dl className="grid gap-x-6 gap-y-2 px-6 py-5 sm:grid-cols-[7rem_1fr]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-sm font-semibold text-muted sm:text-[0.95rem]">{k}</dt>
              <dd className="mb-2 sm:mb-0">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mx-auto mt-6 grid max-w-lg gap-3 sm:grid-cols-3 animate-fade-up [animation-delay:200ms]">
        <Button variant="primary" onClick={addToCalendar} icon={<CalendarPlus className="size-4" aria-hidden="true" />}>
          Add to calendar
        </Button>
        <AnchorButton href={CLINIC.phoneHref} variant="outline" icon={<Phone className="size-4" aria-hidden="true" />}>
          Call clinic
        </AnchorButton>
        <AnchorButton href={MAPS_DIRECTIONS_URL} target="_blank" rel="noopener noreferrer" variant="outline" icon={<Navigation className="size-4" aria-hidden="true" />}>
          Directions
        </AnchorButton>
      </div>

      <div className="mx-auto mt-8 max-w-lg rounded-2xl bg-soft px-5 py-4 text-left text-[0.95rem]">
        <p className="font-semibold text-navy">Need to reschedule or cancel?</p>
        <p className="mt-1 text-muted">
          Please call <a href={CLINIC.phoneHref} className="font-semibold text-navy underline underline-offset-4">{CLINIC.phoneDisplay}</a> with
          your appointment ID. Arrive 10 minutes early and bring any previous reports.
        </p>
      </div>

      <LinkButton href="/" variant="ghost" className="mt-6">
        Back to home
      </LinkButton>
    </div>
  );
}
