import { CalendarCheck, Phone } from "lucide-react";
import { CLINIC } from "@/lib/constants/clinic";
import { AnchorButton, LinkButton } from "@/components/ui/Button";
import { LeafSprig, Mandala } from "./Botanical";

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
        <div data-reveal className="relative overflow-hidden rounded-[2rem] bg-navy px-6 py-12 text-center text-white sm:px-12 md:py-16">
          <Mandala className="absolute -right-24 -top-24 size-80 text-teal opacity-40" />
          <LeafSprig className="absolute -bottom-6 left-4 hidden h-48 text-teal opacity-40 sm:block" />
          <div className="relative mx-auto max-w-2xl">
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
