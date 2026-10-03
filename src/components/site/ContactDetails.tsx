import { Clock, MapPin, Navigation, Phone } from "lucide-react";
import { CLINIC, CLINIC_ADDRESS_LINES, MAPS_DIRECTIONS_URL, MAPS_EMBED_URL } from "@/lib/constants/clinic";
import { formatDayGroup, formatSessions } from "@/lib/format";
import { AnchorButton } from "@/components/ui/Button";
import type { summariseTimings } from "@/lib/availability/engine";

type HourGroups = ReturnType<typeof summariseTimings>;

export function ContactList({ hours }: { hours: HourGroups }) {
  return (
    <ul className="space-y-6">
      <li className="flex gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-teal-soft text-teal-dark">
          <Phone className="size-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-muted">Appointments</p>
          <a href={CLINIC.phoneHref} className="text-xl font-semibold text-navy hover:underline underline-offset-4">
            {CLINIC.phoneDisplay}
          </a>
        </div>
      </li>
      <li className="flex gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-teal-soft text-teal-dark">
          <MapPin className="size-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-muted">Address</p>
          <address className="not-italic">
            {CLINIC.name}
            {CLINIC_ADDRESS_LINES.map((l) => (
              <span key={l} className="block">
                {l}
              </span>
            ))}
          </address>
        </div>
      </li>
      <li className="flex gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-teal-soft text-teal-dark">
          <Clock className="size-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-muted">Opening hours</p>
          <dl className="space-y-1">
            {hours.map((g) => (
              <div key={g.days.join()} className="flex flex-wrap gap-x-2">
                <dt className="font-semibold">{formatDayGroup(g.days)}:</dt>
                <dd className="text-muted">{formatSessions(g.sessions)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </li>
    </ul>
  );
}

export function MapEmbed({ className = "" }: { className?: string }) {
  return (
    <div className={`overflow-hidden rounded-[var(--radius-card)] border border-line/70 bg-soft shadow-soft ${className}`}>
      <iframe
        title="Map showing Kumar Ayurveda, Vaishali Nagar, Jaipur"
        src={MAPS_EMBED_URL}
        className="block h-full min-h-[320px] w-full"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
      />
    </div>
  );
}

export function DirectionsButton() {
  return (
    <AnchorButton
      href={MAPS_DIRECTIONS_URL}
      target="_blank"
      rel="noopener noreferrer"
      variant="outline"
      icon={<Navigation className="size-4" aria-hidden="true" />}
    >
      Get directions
    </AnchorButton>
  );
}
