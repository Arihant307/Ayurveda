import { getClinicHours } from "@/lib/db/queries";
import { pageMetadata } from "@/lib/seo";
import { PageHero, Section } from "@/components/site/Section";
import { ContactList, DirectionsButton, MapEmbed } from "@/components/site/ContactDetails";
import { ContactForm } from "@/components/site/ContactForm";
import { CLINIC } from "@/lib/constants/clinic";
import { AnchorButton } from "@/components/ui/Button";
import { Phone } from "lucide-react";

export const revalidate = 300;

export const metadata = pageMetadata({
  title: "Contact & Directions — Vaishali Nagar, Jaipur",
  description:
    "Contact Kumar Ayurveda: call 9610101144 or visit us at S-8, JDA Central Market, Amrapali Circle, Vaishali Nagar, Jaipur. Opening hours, map and enquiry form.",
  path: "/contact",
});

export default async function ContactPage() {
  const hours = await getClinicHours();
  return (
    <>
      <PageHero eyebrow="Contact" title="We’re here to help">
        Call us to book or ask a question, or send a message and our team will get back to you during clinic hours.
      </PageHero>
      <Section>
        <div className="container-site grid gap-10 lg:grid-cols-[1fr_1.15fr]">
          <div>
            <ContactList hours={hours.groups} />
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <AnchorButton href={CLINIC.phoneHref} icon={<Phone className="size-4" aria-hidden="true" />}>
                Call {CLINIC.phoneDisplay}
              </AnchorButton>
              <DirectionsButton />
            </div>
            <MapEmbed className="mt-10 h-[340px]" />
          </div>
          <section aria-labelledby="form-title" className="rounded-[var(--radius-card)] border border-line/70 bg-white p-6 shadow-soft md:p-8">
            <h2 id="form-title" className="text-3xl md:text-4xl">Send us a message</h2>
            <p className="mt-2 text-muted">
              For appointments, booking online or calling is quickest. Please don’t share detailed medical information here.
            </p>
            <ContactForm />
          </section>
        </div>
      </Section>
    </>
  );
}
