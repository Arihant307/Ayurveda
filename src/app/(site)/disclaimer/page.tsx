import { pageMetadata } from "@/lib/seo";
import { LegalPage } from "@/components/site/LegalPage";

export const metadata = pageMetadata({
  title: "Medical Disclaimer",
  description: "Important information about the health content on the Kumar Ayurveda website.",
  path: "/disclaimer",
});

export default function DisclaimerPage() {
  return (
    <LegalPage title="Medical Disclaimer" updated="October 2026" intro="Please read this before acting on anything you read on this website.">
      <h2>General information only</h2>
      <p>
        The information on this website describes traditional Ayurvedic concepts and therapies for general awareness. It is
        not medical advice and is not intended to diagnose, treat, cure or prevent any disease.
      </p>
      <h2>Not a substitute for medical care</h2>
      <p>
        Ayurvedic therapies are offered to support general wellbeing. They are not a substitute for diagnosis or treatment by a
        qualified medical practitioner. Do not stop, change or delay any prescribed treatment because of something you have
        read on this website. Always keep your own doctor informed about any Ayurvedic treatment you receive.
      </p>
      <h2>Individual results vary</h2>
      <p>
        Every person is different. Descriptions of therapies refer to their traditional uses, not to guaranteed outcomes. Any
        patient experiences shared on this website are personal and do not imply that others will have the same experience.
      </p>
      <h2>Suitability</h2>
      <p>
        Some therapies, including Panchakarma, are not suitable for everyone — for example during pregnancy, after recent
        surgery or with certain medical conditions. Suitability is decided only after a consultation with our physician.
      </p>
      <h2>Emergencies</h2>
      <p>
        <strong>This website and our clinic do not provide emergency care.</strong> In a medical emergency, call 112 or go to
        the nearest hospital immediately.
      </p>
    </LegalPage>
  );
}
