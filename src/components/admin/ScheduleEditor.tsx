"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { WEEKDAY_NAMES } from "@/lib/datetime";
import { fieldErrors, weeklyScheduleSchema } from "@/lib/validation";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { cn } from "@/lib/cn";
import { useAction } from "./useAction";

type Session = { startTime: string; endTime: string; slotMinutes: number };
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const DEFAULT_SESSION: Session = { startTime: "10:00", endTime: "13:30", slotMinutes: 30 };

export function ScheduleEditor({ doctorId, doctorName, initial }: { doctorId: string; doctorName: string; initial: { weekday: number; startTime: string; endTime: string; slotMinutes: number }[] }) {
  const { run, pending } = useAction();
  const [days, setDays] = useState<Session[][]>(() =>
    Array.from({ length: 7 }, (_, d) =>
      initial
        .filter((s) => s.weekday === d)
        .sort((a, b) => a.startTime.localeCompare(b.startTime))
        .map(({ startTime, endTime, slotMinutes }) => ({ startTime, endTime, slotMinutes })),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const update = (d: number, fn: (s: Session[]) => Session[]) => {
    setDays((all) => all.map((s, i) => (i === d ? fn(s) : s)));
    setDirty(true);
    setError(null);
  };

  async function save() {
    const payload = { days: days.map((sessions, weekday) => ({ weekday, sessions })) };
    const parsed = weeklyScheduleSchema.safeParse(payload);
    if (!parsed.success) {
      setError(Object.values(fieldErrors(parsed.error))[0] ?? "Please check the times.");
      return;
    }
    const res = await run("schedule", `/api/admin/doctors/${doctorId}/schedule`, { method: "PUT", json: payload }, `Working hours saved for ${doctorName}`);
    if (res.ok) setDirty(false);
    else if (res.fieldErrors) setError(Object.values(res.fieldErrors)[0]);
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-line/70 bg-white p-4 shadow-soft sm:p-6">
      <h2 className="text-3xl">Weekly working hours</h2>
      <p className="mt-1 text-muted">Add one or more sessions per day. The gap between sessions is a break. Existing appointments are never changed.</p>
      {error && <Alert tone="error" className="mt-4">{error}</Alert>}
      <ul className="mt-5 divide-y divide-line">
        {ORDER.map((d) => {
          const sessions = days[d];
          const working = sessions.length > 0;
          return (
            <li key={d} className="py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-sans text-lg font-bold text-ink">{WEEKDAY_NAMES[d]}</h3>
                <label className="inline-flex min-h-11 cursor-pointer items-center gap-3">
                  <span className={cn("text-sm font-semibold", working ? "text-green" : "text-muted")}>{working ? "Working" : "Closed"}</span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={working}
                    onChange={(e) => update(d, () => (e.target.checked ? [{ ...DEFAULT_SESSION }, { startTime: "17:00", endTime: "20:00", slotMinutes: 30 }] : []))}
                    className="peer sr-only"
                  />
                  <span aria-hidden="true" className={cn("relative h-7 w-12 rounded-full transition-colors peer-focus-visible:ring-4 peer-focus-visible:ring-teal-soft", working ? "bg-green" : "bg-line")}>
                    <span className={cn("absolute top-1 size-5 rounded-full bg-white shadow transition-transform", working ? "translate-x-6" : "translate-x-1")} />
                  </span>
                  <span className="sr-only">{WEEKDAY_NAMES[d]} is a working day</span>
                </label>
              </div>
              {working && (
                <div className="mt-3 space-y-2">
                  {sessions.map((s, i) => (
                    <div key={i} className="flex flex-wrap items-end gap-2 rounded-xl bg-cream p-3">
                      <label className="text-sm">
                        <span className="block font-semibold">From</span>
                        <input type="time" step={300} value={s.startTime} onChange={(e) => update(d, (all) => all.map((x, j) => (j === i ? { ...x, startTime: e.target.value } : x)))} className="min-h-11 rounded-lg border border-line bg-white px-2" />
                      </label>
                      <label className="text-sm">
                        <span className="block font-semibold">To</span>
                        <input type="time" step={300} value={s.endTime} onChange={(e) => update(d, (all) => all.map((x, j) => (j === i ? { ...x, endTime: e.target.value } : x)))} className="min-h-11 rounded-lg border border-line bg-white px-2" />
                      </label>
                      <label className="text-sm">
                        <span className="block font-semibold">Each appointment</span>
                        <select value={s.slotMinutes} onChange={(e) => update(d, (all) => all.map((x, j) => (j === i ? { ...x, slotMinutes: Number(e.target.value) } : x)))} className="min-h-11 rounded-lg border border-line bg-white px-2">
                          {[15, 20, 30, 45, 60, 90].map((m) => (
                            <option key={m} value={m}>{m} minutes</option>
                          ))}
                        </select>
                      </label>
                      <button type="button" onClick={() => update(d, (all) => all.filter((_, j) => j !== i))} className="ml-auto flex size-11 items-center justify-center rounded-full text-danger hover:bg-danger-soft" aria-label={`Remove session ${i + 1} on ${WEEKDAY_NAMES[d]}`}>
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                  <Button size="sm" variant="ghost" icon={<Plus className="size-4" aria-hidden="true" />} onClick={() => update(d, (all) => [...all, { startTime: "17:00", endTime: "20:00", slotMinutes: all[0]?.slotMinutes ?? 30 }])}>
                    Add session
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="sticky bottom-0 -mx-4 mt-4 flex items-center justify-end gap-3 border-t border-line bg-white px-4 pt-4 pb-1 sm:-mx-6 sm:px-6">
        {dirty && <span className="text-sm text-warning">Unsaved changes</span>}
        <Button onClick={save} loading={pending === "schedule"} loadingText="Saving…" disabled={!dirty}>
          Save working hours
        </Button>
      </div>
    </div>
  );
}
