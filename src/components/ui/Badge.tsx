import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const tones = {
  neutral: "bg-soft text-ink border border-line",
  navy: "bg-navy-soft text-navy",
  teal: "bg-teal-soft text-teal-dark",
  amber: "bg-amber-soft text-amber",
  danger: "bg-danger-soft text-danger",
  /** Logo accent: navy text with a magenta→violet dot (white text on magenta would fail AA). */
  accent: "bg-navy-soft text-navy",
};

export function Badge({ tone = "neutral", children, className }: { tone?: keyof typeof tones; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold tracking-wide", tones[tone], className)}>
      {tone === "accent" && <span className="size-1.5 shrink-0 rounded-full bg-accent-gradient" aria-hidden="true" />}
      {children}
    </span>
  );
}
