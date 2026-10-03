import { CalendarCheck, Phone } from "lucide-react";
import { CLINIC } from "@/lib/constants/clinic";
import { AnchorButton, LinkButton } from "@/components/ui/Button";
import { LeafSprig, LogoLeaf, PlusMark } from "./Botanical";

export function BookingCta({
  title = "Begin with a consultation",
  text = "Choose your doctor, pick a convenient time and book online in about a minute. Prefer to talk? Call us and our team will help.",
  href = "/book",
}: {
  title?: string;
  text?: string;
  href?: string;
}) {
  return (
    <section aria-labelledby="cta-title" className="py-16 md:py-20">
      <div className="container-site">
        <div data-reveal className="glow-navy relative overflow-hidden rounded-[2rem] px-6 py-12 text-center text-white shadow-lift sm:px-12 md:py-16">
          <span className="absolute inset-x-0 top-0 h-1 bg-accent-gradient" aria-hidden="true" />
          <PlusMark variant="outline" className="absolute -right-20 -top-20 size-80 text-white/10" />
          <LeafSprig className="absolute -bottom-6 left-4 hidden h-48 text-teal opacity-30 sm:block" />
          <div className="relative mx-auto max-w-2xl">
            {/* The logo's mark: leaf resting against the cross */}
            <div className="relative mx-auto mb-6 h-12 w-16" aria-hidden="true">
              <PlusMark id="cta-plus" className="absolute right-0 top-0 size-10" />
              <LogoLeaf className="absolute bottom-0 left-0 w-12 text-teal" />
            </div>
            <h2 id="cta-title" className="text-4xl text-white md:text-5xl">
              {title}
            </h2>
            <p className="mt-4 text-lg text-on-navy-muted">{text}</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <LinkButton href={href} variant="light" size="lg" icon={<CalendarCheck className="size-5" aria-hidden="true" />}>
                Book Appointment
              </LinkButton>
              <AnchorButton
                href={CLINIC.phoneHref}
                size="lg"
                className="border-2 border-white/40 bg-transparent text-white hover:bg-white/10"
                icon={<Phone className="size-5" aria-hidden="true" />}
              >
                {CLINIC.phoneDisplay}
              </AnchorButton>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
