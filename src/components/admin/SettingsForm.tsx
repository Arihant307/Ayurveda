"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Field";
import { useAction } from "./useAction";

export function SettingsForm({ bookingWindowDays, minLeadMinutes }: { bookingWindowDays: number; minLeadMinutes: number }) {
  const { run, pending } = useAction();
  const [windowDays, setWindowDays] = useState(String(bookingWindowDays));
  const [lead, setLead] = useState(String(minLeadMinutes));
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function save(e: FormEvent) {
    e.preventDefault();
    const res = await run("settings", "/api/admin/settings", { method: "PUT", json: { bookingWindowDays: windowDays, minLeadMinutes: lead } }, "Booking rules saved");
    setErrors(res.ok ? {} : (res.fieldErrors ?? {}));
  }

  return (
    <form onSubmit={save} noValidate className="rounded-[var(--radius-card)] border border-line/70 bg-white p-4 shadow-soft sm:p-6">
      <h2 className="text-3xl">Online booking rules</h2>
      <p className="mt-1 text-muted">Apply to all doctors.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <TextField label="Patients can book up to" type="number" min={1} max={365} value={windowDays} onChange={(e) => setWindowDays(e.target.value)} error={errors.bookingWindowDays} hint="days ahead (including today)" />
        <SelectField label="Latest booking before a slot" value={lead} onChange={(e) => setLead(e.target.value)} error={errors.minLeadMinutes}>
          {[0, 30, 60, 120, 180, 240, 720, 1440].map((m) => (
            <option key={m} value={m}>
              {m === 0 ? "Any time before" : m < 60 ? `${m} minutes before` : m === 1440 ? "1 day before" : `${m / 60} hour${m === 60 ? "" : "s"} before`}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="mt-5 flex justify-end">
        <Button type="submit" loading={pending === "settings"}>Save rules</Button>
      </div>
    </form>
  );
}
