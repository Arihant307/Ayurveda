"use client";

import { Pill } from "./ui";
import type { Indicator } from "@/lib/types";

const IND_TONE: Record<string, "bad" | "warn" | "neutral"> = { high: "bad", medium: "warn", low: "neutral" };

export function IndicatorList({ items, empty }: { items: Indicator[]; empty: string }) {
  if (!items.length) return <p className="text-sm text-ink-muted">{empty}</p>;
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.code} className="flex items-start gap-3 rounded-xl bg-canvas px-3 py-2.5">
          <Pill tone={IND_TONE[i.severity] ?? "neutral"}>{i.severity}</Pill>
          <div className="min-w-0 text-sm">
            <p className="font-medium text-ink">{i.description}</p>
            {i.evidence && <p className="mt-0.5 text-xs break-words text-ink-muted">Matched: <mark className="rounded bg-medium-soft px-1 text-medium-ink">{i.evidence}</mark></p>}
          </div>
        </li>
      ))}
    </ul>
  );
}

