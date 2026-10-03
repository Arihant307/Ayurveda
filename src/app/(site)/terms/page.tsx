import { CLINIC } from "@/lib/constants/clinic";
import { pageMetadata } from "@/lib/seo";
import { LegalPage } from "@/components/site/LegalPage";

export const metadata = pageMetadata({
  title: "Terms of Use",
  description: "Terms for using the Kumar Ayurveda website and online appointment booking.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use" updated="October 2026" intro="Terms for using this website and our online booking.">
      <p>By using this website you agree to these terms. If you do not agree, please do not use the website.</p>
      <h2>Online appointments</h2>
      <ul>
        <li>An online booking is a request for an appointment at the date and time you choose. Our team may call you to confirm.</li>
        <li>Please provide accurate details. Bookings with false or incomplete information may be cancelled.</li>
        <li>One active appointment per patient, per doctor, per day can be booked online.</li>
        <li>
          To reschedule or cancel, please call {CLINIC.phoneDisplay} with your appointment ID, giving as much notice as
          possible.
        </li>
        <li>
          Appointment times are approximate; consultations can occasionally run late. We appreciate your patience and will
          let you know of significant delays where possible.
        </li>
        <li>We may need to reschedule an appointment in unavoidable circumstances. We will contact you if this happens.</li>
      </ul>
      <h2>Fees</h2>
      <p>Consultation and therapy fees are payable at the clinic. Please ask our team for current fees.</p>
      <h2>Website content</h2>
      <p>
        Content on this website is for general information only and is not medical advice. Please read our Medical Disclaimer.
        Text, images and the Kumar Ayurveda name and logo may not be copied without permission.
      </p>
      <h2>Acceptable use</h2>
      <p>Please do not misuse the website, attempt to access the administration area without authorisation, or submit spam.</p>
      <h2>Liability</h2>
      <p>
        We work to keep this website accurate and available, but we cannot guarantee that it will always be error-free or
        uninterrupted. To the extent permitted by law, we are not liable for losses arising from use of the website.
      </p>
      <h2>Governing law</h2>
      <p>These terms are governed by the laws of India. Courts in Jaipur, Rajasthan have jurisdiction.</p>
    </LegalPage>
  );
}
