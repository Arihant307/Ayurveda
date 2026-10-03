import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const tones = {
  neutral: "bg-cream-deep text-ink",
  green: "bg-green-soft text-green-deep",
  teal: "bg-teal-soft text-teal-deep",
  saffron: "bg-saffron-soft text-warning",
  danger: "bg-danger-soft text-danger",
  navy: "bg-white text-navy border border-line",
};

export function Badge({ tone = "neutral", children, className }: { tone?: keyof typeof tones; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold tracking-wide", tones[tone], className)}>
      {children}
    </span>
  );
}
