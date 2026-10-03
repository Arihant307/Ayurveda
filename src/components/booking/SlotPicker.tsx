"use client";

import { useEffect, useState } from "react";
import { Moon, RefreshCw, Sun } from "lucide-react";
import type { SlotDTO } from "@/lib/availability/serialize";
import { formatTimeString } from "@/lib/datetime";
import { apiFetch } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

type SlotsResponse = { date: string; status: string; slots: SlotDTO[] };

const PERIODS = [
  { key: "morning", label: "Morning", Icon: Sun },
  { key: "evening", label: "Evening", Icon: Moon },
] as const;

export function SlotPicker({
  doctorSlug,
  date,
  value,
  onChange,
  admin = false,
  excludeId,
  refreshKey = 0,
  onNoSlots,
}: {
  doctorSlug: string;
  date: string;
  value?: string;
  onChange: (time: string) => void;
  admin?: boolean;
  excludeId?: string;
  /** Change to force a reload (e.g. after a 409). */
  refreshKey?: number;
  onNoSlots?: () => void;
}) {
  const [slots, setSlots] = useState<SlotDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setSlots(null);
    setError(null);
    const qs = new URLSearchParams({ doctor: doctorSlug, date });
    if (admin) qs.set("admin", "1");
    if (excludeId) qs.set("exclude", excludeId);
    apiFetch<SlotsResponse>(`/api/availability/slots?${qs}`).then((res) => {
      if (cancelled) return;
      if (res.ok) setSlots(res.data.slots);
      else setError(res.message);
    });
    return () => {
      cancelled = true;
    };
  }, [doctorSlug, date, admin, excludeId, refreshKey, reload]);

  if (error) {
    return (
      <Alert
        tone="error"
        title="We couldn't load available times."
        action={
          <Button size="sm" variant="secondary" onClick={() => setReload((r) => r + 1)} icon={<RefreshCw className="size-4" aria-hidden="true" />}>
            Try again
          </Button>
        }
      >
        {error}
      </Alert>
    );
  }

  if (!slots) {
    return (
      <div aria-busy="true" aria-label="Loading available times" className="space-y-6">
        {PERIODS.map((p) => (
          <div key={p.key}>
            <div className="mb-3 h-5 w-24 animate-pulse rounded bg-soft" />
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-soft" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <EmptyState title="No times left on this date" action={onNoSlots && <Button variant="secondary" onClick={onNoSlots}>Choose another date</Button>}>
        All appointments for this day have been taken. Please pick another date, or call us and we’ll try to help.
      </EmptyState>
    );
  }

  return (
    <fieldset className="space-y-6 animate-fade-in">
      <legend className="sr-only">Available times</legend>
      {PERIODS.map(({ key, label, Icon }) => {
        const group = slots.filter((s) => s.period === key);
        if (group.length === 0) return null;
        return (
          <div key={key} role="group" aria-labelledby={`period-${key}`}>
            <h3 id={`period-${key}`} className="mb-3 flex items-center gap-2 font-sans text-sm font-bold uppercase tracking-[0.12em] text-muted">
              <Icon className="size-4 text-teal-dark" aria-hidden="true" />
              {label}
              <span className="font-normal normal-case tracking-normal">· {group.length} available</span>
            </h3>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {group.map((slot) => {
                const checked = value === slot.time;
                return (
                  <label
                    key={slot.time}
                    className={cn(
                      "flex min-h-12 cursor-pointer items-center justify-center rounded-xl border-2 text-[0.975rem] font-semibold transition-all duration-150",
                      "has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-teal-soft active:scale-[0.97]",
                      checked ? "border-navy bg-navy text-white shadow-soft" : "border-teal/60 bg-white text-teal-dark hover:border-teal-dark hover:bg-teal-soft",
                    )}
                  >
                    <input
                      type="radio"
                      name={`slot-${date}`}
                      value={slot.time}
                      checked={checked}
                      onChange={() => onChange(slot.time)}
                      className="sr-only"
                    />
                    {formatTimeString(slot.time)}
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </fieldset>
  );
}
