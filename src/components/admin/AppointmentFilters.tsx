"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { STATUS_LABELS } from "@/lib/constants/appointments";
import { APPOINTMENT_STATUSES } from "@/lib/validation";
import { SelectField, TextField } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";

export function AppointmentFilters({ doctors }: { doctors: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [isPending, startTransition] = useTransition();

  const update = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    next.delete("id");
    startTransition(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  };

  // Search as you type (debounced).
  useEffect(() => {
    if ((params.get("q") ?? "") === q) return;
    const t = setTimeout(() => update({ q: q.trim() || undefined }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const active = ["q", "doctor", "date", "status", "when"].some((k) => params.get(k));

  return (
    <div className="mb-6 rounded-[var(--radius-card)] border border-line/70 bg-white p-4 shadow-soft">
      <div className="relative">
        <TextField
          label="Search"
          type="search"
          placeholder="Name, mobile number or appointment ID"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="[&_input]:pl-11"
        />
        <Search className="pointer-events-none absolute bottom-3.5 left-4 size-5 text-muted" aria-hidden="true" />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SelectField label="Doctor" value={params.get("doctor") ?? ""} onChange={(e) => update({ doctor: e.target.value || undefined })}>
          <option value="">All doctors</option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </SelectField>
        <TextField label="Date" type="date" value={params.get("date") ?? ""} onChange={(e) => update({ date: e.target.value || undefined })} />
        <SelectField label="Status" value={params.get("status") ?? ""} onChange={(e) => update({ status: e.target.value || undefined })}>
          <option value="">Any status</option>
          {APPOINTMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Show"
          value={params.get("date") ? "all" : (params.get("when") ?? "upcoming")}
          disabled={!!params.get("date")}
          onChange={(e) => update({ when: e.target.value === "upcoming" ? undefined : e.target.value })}
        >
          <option value="upcoming">Today &amp; upcoming</option>
          <option value="past">Past</option>
          <option value="all">All dates</option>
        </SelectField>
      </div>
      <div className="mt-3 flex min-h-9 items-center justify-between">
        <span aria-live="polite">{isPending && <Spinner className="size-4" label="Updating…" />}</span>
        {active && (
          <Button
            variant="ghost"
            size="sm"
            icon={<X className="size-4" aria-hidden="true" />}
            onClick={() => {
              setQ("");
              startTransition(() => router.replace(pathname, { scroll: false }));
            }}
          >
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
