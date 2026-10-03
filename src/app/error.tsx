"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { CLINIC } from "@/lib/constants/clinic";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main" className="flex flex-1 items-center justify-center px-5 py-24">
      <div className="max-w-md text-center">
        <p className="eyebrow">Something went wrong</p>
        <h1 className="mt-3 text-4xl">We couldn’t load this page</h1>
        <p className="mt-4 text-muted">
          Please try again in a moment. If you were booking, you can also call us on{" "}
          <a href={CLINIC.phoneHref} className="font-semibold text-green underline underline-offset-4">{CLINIC.phoneDisplay}</a>.
        </p>
        <Button className="mt-8" onClick={reset}>
          Try again
        </Button>
      </div>
    </main>
  );
}
