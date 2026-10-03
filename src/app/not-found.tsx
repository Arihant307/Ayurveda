import Link from "next/link";
import { LinkButton } from "@/components/ui/Button";
import { LeafSprig } from "@/components/site/Botanical";

export default function NotFound() {
  return (
    <main id="main" className="flex flex-1 items-center justify-center px-5 py-24">
      <div className="text-center">
        <LeafSprig className="mx-auto h-28 text-teal-deep opacity-60" />
        <p className="eyebrow mt-4">Page not found</p>
        <h1 className="mt-3 text-5xl">This path has wandered off</h1>
        <p className="mx-auto mt-4 max-w-md text-lg text-muted">The page you’re looking for doesn’t exist or may have moved.</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <LinkButton href="/">Go to home</LinkButton>
          <LinkButton href="/book" variant="outline">
            Book an appointment
          </LinkButton>
        </div>
        <p className="mt-6 text-sm text-muted">
          Or visit <Link href="/treatments" className="font-semibold text-green underline underline-offset-4">our treatments</Link>.
        </p>
      </div>
    </main>
  );
}
