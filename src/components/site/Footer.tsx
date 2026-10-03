import Link from "next/link";
import { Clock, MapPin, Phone } from "lucide-react";
import { FacebookIcon, InstagramIcon, YoutubeIcon } from "./SocialIcons";
import { CLINIC, CLINIC_ADDRESS_LINES, MAPS_DIRECTIONS_URL } from "@/lib/constants/clinic";
import { getClinicHours, getVisibleTreatments } from "@/lib/db/queries";
import { formatDayGroup, formatSessions } from "@/lib/format";
import { Logo } from "./Logo";
import { LEGAL_LINKS, NAV_LINKS } from "./nav";
import { PlusMark, Wave } from "./Botanical";

export async function Footer() {
  const [treatments, hours] = await Promise.all([getVisibleTreatments(), getClinicHours()]);
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto text-on-navy-muted">
      <Wave className="text-navy" />
      <div className="glow-navy relative overflow-hidden">
        <PlusMark variant="outline" className="absolute -bottom-56 -right-48 size-[26rem] text-white/[0.05]" />
        <div className="relative">
        <div className="container-site grid gap-10 pb-10 pt-8 md:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1.3fr] lg:gap-8">
          <div>
            <Logo variant="onDark" className="h-20 w-auto" />
            <p className="mt-4 max-w-xs text-[0.975rem] leading-relaxed">
              An Ayurveda and Panchakarma clinic in Vaishali Nagar, Jaipur — personalised consultations and classical therapies,
              offered with care and modern clinical standards.
            </p>
            <ul className="mt-5 flex gap-2" aria-label="Social media">
              {[
                { href: CLINIC.social.instagram, label: "Instagram", Icon: InstagramIcon },
                { href: CLINIC.social.facebook, label: "Facebook", Icon: FacebookIcon },
                { href: CLINIC.social.youtube, label: "YouTube", Icon: YoutubeIcon },
              ].map(({ href, label, Icon }) => (
                <li key={label}>
                  <a
                    href={href}
                    aria-label={`${label} (coming soon)`}
                    className="flex size-11 items-center justify-center rounded-full border border-white/20 text-white transition-colors hover:border-teal hover:text-teal"
                  >
                    <Icon className="size-5" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <nav aria-labelledby="footer-links">
            <h2 id="footer-links" className="font-sans text-sm font-bold uppercase tracking-[0.14em] text-white">
              Quick links
            </h2>
            <ul className="mt-4 space-y-1">
              {[...NAV_LINKS, { href: "/book", label: "Book Appointment" }].map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="inline-block py-1 hover:text-white hover:underline underline-offset-4">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="footer-treatments">
            <h2 id="footer-treatments" className="font-sans text-sm font-bold uppercase tracking-[0.14em] text-white">
              Treatments
            </h2>
            <ul className="mt-4 space-y-1">
              {treatments.slice(0, 7).map((t) => (
                <li key={t.id}>
                  <Link href={`/treatments/${t.slug}`} className="inline-block py-1 hover:text-white hover:underline underline-offset-4">
                    {t.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h2 className="font-sans text-sm font-bold uppercase tracking-[0.14em] text-white">Visit us</h2>
            <ul className="mt-4 space-y-4 text-[0.975rem]">
              <li className="flex gap-3">
                <MapPin className="mt-1 size-5 shrink-0 text-teal" aria-hidden="true" />
                <a href={MAPS_DIRECTIONS_URL} target="_blank" rel="noopener noreferrer" className="hover:text-white">
                  <address className="not-italic">
                    {CLINIC_ADDRESS_LINES.map((line) => (
                      <span key={line} className="block">
                        {line}
                      </span>
                    ))}
                  </address>
                </a>
              </li>
              <li className="flex gap-3">
                <Phone className="mt-1 size-5 shrink-0 text-teal" aria-hidden="true" />
                <a href={CLINIC.phoneHref} className="font-semibold text-white hover:underline underline-offset-4">
                  {CLINIC.phoneDisplay}
                </a>
              </li>
              <li className="flex gap-3">
                <Clock className="mt-1 size-5 shrink-0 text-teal" aria-hidden="true" />
                <dl>
                  {hours.groups.map((g) => (
                    <div key={g.days.join()}>
                      <dt className="font-semibold text-white">{formatDayGroup(g.days)}</dt>
                      <dd>{formatSessions(g.sessions)}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/15">
          <div className="container-site flex flex-col gap-3 py-6 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p>© {year} {CLINIC.name}. All rights reserved.</p>
            <ul className="flex flex-wrap gap-x-5 gap-y-1">
              {LEGAL_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="hover:text-white hover:underline underline-offset-4">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <p className="container-site pb-6 text-xs leading-relaxed text-on-navy-muted/90">
            Information on this website is for general awareness only and is not a substitute for professional medical advice.
            Ayurvedic therapies are offered to support general wellbeing. Please consult a qualified doctor about any health concern.
          </p>
        </div>
        </div>
      </div>
    </footer>
  );
}
