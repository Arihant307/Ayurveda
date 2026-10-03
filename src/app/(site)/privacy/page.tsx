import { CLINIC, CLINIC_ADDRESS_ONE_LINE } from "@/lib/constants/clinic";
import { pageMetadata } from "@/lib/seo";
import { LegalPage } from "@/components/site/LegalPage";

export const metadata = pageMetadata({
  title: "Privacy Policy",
  description: "How Kumar Ayurveda collects, uses and protects your personal information.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="October 2026" intro="How we collect, use and protect your personal information.">
      <p>
        {CLINIC.name} (“we”, “us”) respects your privacy. This policy explains what information we collect through this
        website, why we collect it and how we look after it. It should be read with our Terms of Use and Medical Disclaimer.
      </p>
      <h2>Information we collect</h2>
      <ul>
        <li>
          <strong>Appointment requests:</strong> your name, mobile number, optional email address, age, gender, the type of
          appointment, the reason for your visit and any message you add.
        </li>
        <li>
          <strong>Contact form messages:</strong> your name, mobile number, optional email address and your message.
        </li>
        <li>
          <strong>Technical information:</strong> basic information that web servers record automatically, such as IP address
          and browser type, used for security and to keep the site running.
        </li>
      </ul>
      <h2>How we use it</h2>
      <ul>
        <li>To schedule, confirm, reschedule or cancel your appointment, and to contact you about it.</li>
        <li>To send you a confirmation email if you provide an email address.</li>
        <li>To prepare for your consultation and maintain clinical records as required.</li>
        <li>To respond to your enquiries.</li>
      </ul>
      <p>We do not sell your personal information, and we do not use it for third-party advertising.</p>
      <h2>Sharing</h2>
      <p>
        Your information is accessible only to authorised clinic staff. We use trusted service providers to host this website,
        store data and send emails; they process data only on our instructions. We may disclose information where required by
        law.
      </p>
      <h2>Storage and security</h2>
      <p>
        Data is stored on secure, access-controlled systems. Staff access to the administration area is protected by individual
        passwords. No system is completely secure, but we take reasonable measures to protect your information.
      </p>
      <h2>Your choices</h2>
      <p>
        You may ask us to access, correct or delete your personal information, subject to any legal obligation to keep medical
        records. Please call us on {CLINIC.phoneDisplay} or visit us at {CLINIC_ADDRESS_ONE_LINE}.
      </p>
      <h2>Cookies</h2>
      <p>
        The public website does not use advertising or tracking cookies. A strictly necessary cookie is used only to keep
        clinic staff signed in to the administration area. The embedded Google Map is provided by Google and is subject to
        Google’s own privacy policy.
      </p>
      <h2>Changes</h2>
      <p>We may update this policy from time to time. The date at the top shows when it was last changed.</p>
    </LegalPage>
  );
}
