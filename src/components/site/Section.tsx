import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { PlusMark } from "./Botanical";

export function Section({
  id,
  className,
  children,
  tone = "white",
  labelledBy,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
  tone?: "white" | "soft" | "navy";
  labelledBy?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn(
        "relative py-16 md:py-24",
        tone === "white" && "bg-white",
        tone === "soft" && "glow-soft",
        tone === "navy" && "bg-navy text-white",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function SectionHeading({
  id,
  eyebrow,
  title,
  children,
  align = "left",
  onDark = false,
  as: Tag = "h2",
}: {
  id?: string;
  eyebrow?: string;
  title: ReactNode;
  children?: ReactNode;
  align?: "left" | "center";
  onDark?: boolean;
  as?: "h1" | "h2";
}) {
  return (
    <div data-reveal className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
      {eyebrow && <p className={cn("eyebrow mb-3", onDark && "text-teal")}>{eyebrow}</p>}
      <Tag id={id} className={cn("text-[2.15rem] sm:text-[2.6rem] md:text-5xl", onDark && "text-white")}>
        {title}
      </Tag>
      <span className={cn("mt-4 block h-1 w-14 rounded-full bg-accent-gradient", align === "center" && "mx-auto")} aria-hidden="true" />
      {children && (
        <div className={cn("mt-4 text-lg", onDark ? "text-on-navy-muted" : "text-muted")}>{children}</div>
      )}
    </div>
  );
}

/** Hero band for inner pages (contains the page's single H1). */
export function PageHero({
  eyebrow,
  title,
  children,
  aside,
}: {
  eyebrow?: string;
  title: ReactNode;
  children?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="glow-soft relative overflow-hidden border-b border-line/70">
      <PlusMark variant="outline" className="absolute -right-24 -top-24 size-96 text-teal/25" />
      <div className="container-site relative grid gap-8 py-14 md:grid-cols-[1.4fr_1fr] md:items-center md:py-20">
        <div>
          {eyebrow && <p className="eyebrow mb-3 animate-fade-up">{eyebrow}</p>}
          <h1 className="text-[2.5rem] leading-[1.05] sm:text-5xl md:text-6xl animate-fade-up">{title}</h1>
          <span className="mt-5 block h-1 w-16 rounded-full bg-accent-gradient animate-fade-up" aria-hidden="true" />
          {children && <div className="mt-5 max-w-2xl text-lg text-muted animate-fade-up [animation-delay:80ms]">{children}</div>}
        </div>
        {aside}
      </div>
    </div>
  );
}
