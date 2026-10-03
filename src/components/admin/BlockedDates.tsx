"use client";

import { useState, type FormEvent } from "react";
import { CalendarOff, Trash2 } from "lucide-react";
import { formatDateStringMedium, istDateString } from "@/lib/datetime";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "./ConfirmDialog";
import { useAction } from "./useAction";
import { useToast } from "@/components/ui/Toast";

export type BlockedRow = { id: string; date: string; reason: string | null };

export function BlockedDates({ doctorId, title, description, rows, emptyText }: { doctorId: string | null; title: string; description: string; rows: BlockedRow[]; emptyText: string }) {
  const { run, pending } = useAction();
  const toast = useToast();
  const today = istDateString(new Date());
  const [date, setDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [remove, setRemove] = useState<BlockedRow | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!date) {
      setErrors({ date: "Please choose a date." });
      return;
    }
    setErrors({});
    const res = await run<{ affected: number }>("add", "/api/admin/blocked-dates", { method: "POST", json: { doctorId, date, endDate: endDate || undefined, reason } }, "Saved — online booking is closed on those dates");
    if (res.ok) {
      if (res.data.affected > 0) {
        toast("error", `Note: ${res.data.affected} existing appointment(s) fall on these dates — please reschedule or cancel them.`);
      }
      setDate("");
      setEndDate("");
      setReason("");
    } else if (res.fieldErrors) setErrors(res.fieldErrors);
  }

  return (
    <section className="rounded-[var(--radius-card)] border border-line/70 bg-white p-4 shadow-soft sm:p-6" aria-label={title}>
      <h2 className="text-3xl">{title}</h2>
      <p className="mt-1 text-muted">{description}</p>
      <form onSubmit={add} noValidate className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_1.4fr_auto] sm:items-end">
        <TextField label="From" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} error={errors.date} required />
        <TextField label="To" type="date" min={date || today} value={endDate} onChange={(e) => setEndDate(e.target.value)} error={errors.endDate} optional />
        <TextField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Diwali" optional />
        <Button type="submit" loading={pending === "add"} icon={<CalendarOff className="size-4" aria-hidden="true" />}>
          Block
        </Button>
      </form>
      {rows.length === 0 ? (
        <EmptyState className="mt-5 py-6" title={emptyText} />
      ) : (
        <ul className="mt-5 divide-y divide-line rounded-xl border border-line">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span>
                <span className="font-semibold">{formatDateStringMedium(r.date)}</span>
                {r.reason && <span className="text-muted"> · {r.reason}</span>}
              </span>
              <button type="button" onClick={() => setRemove(r)} className="flex size-11 items-center justify-center rounded-full text-danger hover:bg-danger-soft" aria-label={`Remove ${formatDateStringMedium(r.date)}`}>
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!remove}
        title="Re-open this date?"
        confirmLabel="Yes, re-open"
        loading={pending === "remove"}
        onClose={() => setRemove(null)}
        onConfirm={async () => {
          if (!remove) return;
          const res = await run("remove", `/api/admin/blocked-dates/${remove.id}`, { method: "DELETE" }, "Date re-opened for booking");
          if (res.ok) setRemove(null);
        }}
      >
        {remove && <p>Patients will be able to book on {formatDateStringMedium(remove.date)} again.</p>}
      </ConfirmDialog>
    </section>
  );
}
