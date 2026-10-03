import type { ReactNode } from "react";
import { PageHero } from "./Section";

export function LegalPage({ title, updated, intro, children }: { title: string; updated: string; intro: ReactNode; children: ReactNode }) {
  return (
    <>
      <PageHero eyebrow="Legal" title={title}>
        {intro}
      </PageHero>
      <div className="container-site py-14 md:py-20">
        <article className="prose-clinic mx-auto max-w-3xl text-[1.05rem]">
          <p className="text-sm text-muted">Last updated: {updated}</p>
          {children}
        </article>
      </div>
    </>
  );
}
