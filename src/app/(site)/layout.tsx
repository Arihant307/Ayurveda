import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { Logo } from "@/components/site/Logo";
import { JsonLd } from "@/components/site/JsonLd";
import { MobileCallBar } from "@/components/site/MobileCallBar";
import { getClinicHours } from "@/lib/db/queries";
import { clinicJsonLd } from "@/lib/seo";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const hours = await getClinicHours();
  return (
    <>
      <JsonLd data={clinicJsonLd(hours.sessions)} />
      <Header logo={<Logo priority />} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
      <MobileCallBar />
    </>
  );
}
