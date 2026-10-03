"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Check, CheckCheck, Mail, Phone, XCircle } from "lucide-react";
import type { AppointmentDTO, AppointmentLogDTO } from "@/lib/db/admin";
import { STATUS_LABELS } from "@/lib/constants/appointments";
import { formatDateLong, formatDateStringLong, formatDateTime, formatTime, formatTimeString } from "@/lib/datetime";
import { apiFetch } from "@/lib/client-api";
import { Dialog } from "@/components/ui/Dialog";
import { Button, AnchorButton } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";
import { TextAreaField } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { BookingCalendar } from "@/components/booking/Calendar";
import { SlotPicker } from "@/components/booking/SlotPicker";
import { StatusBadge } from "./StatusBadge";
import { ConfirmDialog } from "./ConfirmDialog";

type Detail = { appointment: AppointmentDTO; logs: AppointmentLogDTO[]; patientVisits: number };

const ACTION_LABEL: Record<string, string> = {
  CREATED: "Booked",
  CONFIRMED: "Confirmed",
  COMPLETED: "Marked completed",
  CANCELLED: "Cancelled",
  RESCHEDULED: "Rescheduled",
};

/** Opens when the URL has ?id=<appointmentId>. Usable from any admin page. */
export function AppointmentDrawer() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const id = params.get("id");

  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<null | "confirm" | "complete">(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState<string | undefined>();
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [newDate, setNewDate] = useState<string | undefined>();
  const [newTime, setNewTime] = useState<string | undefined>();
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [slotRefresh, setSlotRefresh] = useState(0);

  const load = useCallback(async (appointmentId: string) => {
    setError(null);
    const res = await apiFetch<Detail>(`/api/admin/appointments/${appointmentId}`);
    if (res.ok) setDetail(res.data);
    else setError(res.message);
  }, []);

  useEffect(() => {
    setDetail(null);
    if (id) load(id);
  }, [id, load]);

  const close = () => {
    const next = new URLSearchParams(params);
    next.delete("id");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  };

  async function act(key: string, body: Record<string, unknown>, success: string): Promise<boolean> {
    if (!id) return false;
    setBusy(key);
    try {
      const res = await apiFetch<Detail>(`/api/admin/appointments/${id}`, { method: "PATCH", json: body });
      if (res.ok) {
        setDetail(res.data);
        toast("success", success);
        router.refresh();
        return true;
      }
      if (key === "reschedule") {
        setRescheduleError(res.message);
        if (res.status === 409) {
          setNewTime(undefined);
          setSlotRefresh((k) => k + 1);
        }
      } else if (key === "cancel" && res.fieldErrors?.reason) {
        setCancelError(res.fieldErrors.reason);
      } else {
        toast("error", res.message);
      }
      return false;
    } finally {
      setBusy(null);
    }
  }

  const a = detail?.appointment;
  const start = a ? new Date(a.startsAt) : null;
  const canChange = a && (a.status === "PENDING" || a.status === "CONFIRMED");

  return (
    <>
      <Dialog
        open={!!id}
        onClose={close}
        variant="drawer"
        title={a ? a.patientName : "Appointment"}
        description={a && <span className="font-mono font-semibold text-navy">{a.code}</span>}
        footer={
          a && canChange ? (
            <div className="grid w-full gap-2 sm:grid-cols-2">
              {a.status === "PENDING" && (
                <Button onClick={() => setConfirmAction("confirm")} icon={<Check className="size-4" aria-hidden="true" />}>
                  Confirm
                </Button>
              )}
              <Button variant="secondary" onClick={() => setConfirmAction("complete")} icon={<CheckCheck className="size-4" aria-hidden="true" />}>
                Mark completed
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setNewDate(undefined);
                  setNewTime(undefined);
                  setRescheduleError(null);
                  setRescheduleOpen(true);
                }}
                icon={<CalendarClock className="size-4" aria-hidden="true" />}
              >
                Reschedule
              </Button>
              <Button
                variant="ghost"
                className="text-danger hover:bg-danger-soft"
                onClick={() => {
                  setCancelReason("");
                  setCancelError(undefined);
                  setCancelOpen(true);
                }}
                icon={<XCircle className="size-4" aria-hidden="true" />}
              >
                Cancel appointment
              </Button>
            </div>
          ) : undefined
        }
      >
        {error ? (
          <Alert tone="error" title="Couldn't open this appointment" action={id && <Button size="sm" variant="secondary" onClick={() => load(id)}>Try again</Button>}>
            {error}
          </Alert>
        ) : !a || !start ? (
          <div className="flex justify-center py-16">
            <Spinner label="Loading appointment…" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="rounded-2xl bg-white p-5 shadow-soft">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <StatusBadge status={a.status} />
                <span className="text-sm text-muted">{a.typeLabel}</span>
              </div>
              <p className="mt-3 font-serif text-3xl font-semibold text-green">{formatTime(start)}</p>
              <p className="text-lg">{formatDateLong(start)}</p>
              <p className="mt-1 text-muted">with {a.doctor.name}</p>
              {a.status === "CANCELLED" && a.cancelReason && (
                <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">Cancelled: {a.cancelReason}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <AnchorButton href={`tel:+91${a.patientPhone}`} variant="primary" icon={<Phone className="size-4" aria-hidden="true" />}>
                Call patient
              </AnchorButton>
              {a.patientEmail ? (
                <AnchorButton href={`mailto:${a.patientEmail}`} variant="outline" icon={<Mail className="size-4" aria-hidden="true" />}>
                  Email
                </AnchorButton>
              ) : (
                <AnchorButton href={`https://wa.me/91${a.patientPhone}`} target="_blank" rel="noopener noreferrer" variant="outline">
                  WhatsApp
                </AnchorButton>
              )}
            </div>

            <section aria-labelledby="patient-h">
              <h3 id="patient-h" className="text-2xl">Patient</h3>
              <dl className="mt-2 grid grid-cols-[7.5rem_1fr] gap-x-4 gap-y-2 text-[0.975rem]">
                <dt className="text-muted">Name</dt>
                <dd className="font-semibold">{a.patientName}</dd>
                <dt className="text-muted">Mobile</dt>
                <dd>{a.patientPhone}</dd>
                <dt className="text-muted">Email</dt>
                <dd className="break-all">{a.patientEmail ?? "—"}</dd>
                <dt className="text-muted">Age / gender</dt>
                <dd>
                  {a.patientAge} · {a.patientGender}
                </dd>
                <dt className="text-muted">Visits</dt>
                <dd>{detail.patientVisits === 1 ? "First booking" : `${detail.patientVisits} bookings in total`}</dd>
              </dl>
            </section>

            <section aria-labelledby="visit-h">
              <h3 id="visit-h" className="text-2xl">Visit</h3>
              <dl className="mt-2 grid grid-cols-[7.5rem_1fr] gap-x-4 gap-y-2 text-[0.975rem]">
                <dt className="text-muted">Type</dt>
                <dd>{a.typeLabel}</dd>
                {a.treatment && (
                  <>
                    <dt className="text-muted">Treatment</dt>
                    <dd>{a.treatment}</dd>
                  </>
                )}
                <dt className="text-muted">Reason</dt>
                <dd className="whitespace-pre-wrap">{a.reason}</dd>
                <dt className="text-muted">Message</dt>
                <dd className="whitespace-pre-wrap">{a.message ?? "—"}</dd>
                <dt className="text-muted">Booked</dt>
                <dd>{formatDateTime(new Date(a.createdAt))}</dd>
              </dl>
            </section>

            <section aria-labelledby="history-h">
              <h3 id="history-h" className="text-2xl">History</h3>
              <ol className="mt-3 space-y-3 border-l-2 border-line pl-4">
                {detail.logs.map((log) => (
                  <li key={log.id} className="relative text-[0.95rem]">
                    <span className="absolute -left-[1.4rem] top-1.5 size-2.5 rounded-full bg-teal-deep" aria-hidden="true" />
                    <p className="font-semibold">
                      {ACTION_LABEL[log.action] ?? log.action}
                      {log.toStatus && log.action !== "RESCHEDULED" && log.action !== "CREATED" && ` → ${STATUS_LABELS[log.toStatus as keyof typeof STATUS_LABELS]}`}
                    </p>
                    <p className="text-sm text-muted">
                      {formatDateTime(new Date(log.createdAt))}
                      {log.by && ` · ${log.by}`}
                    </p>
                    {log.note && <p className="mt-0.5 text-sm">{log.note}</p>}
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction === "confirm" ? "Confirm this appointment?" : "Mark as completed?"}
        confirmLabel={confirmAction === "confirm" ? "Yes, confirm" : "Yes, mark completed"}
        loading={!!busy}
        onClose={() => setConfirmAction(null)}
        onConfirm={async () => {
          const ok = await act(
            confirmAction!,
            { action: confirmAction },
            confirmAction === "confirm" ? "Appointment confirmed" : "Marked as completed",
          );
          if (ok) setConfirmAction(null);
        }}
      >
        {a && start && (
          <p>
            {a.patientName} · {formatDateLong(start)} at {formatTime(start)} with {a.doctor.name}.
          </p>
        )}
      </ConfirmDialog>

      <Dialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this appointment?"
        size="sm"
        description="The time slot will become free for others to book. This can't be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelOpen(false)} disabled={busy === "cancel"}>
              Keep appointment
            </Button>
            <Button
              variant="danger"
              loading={busy === "cancel"}
              onClick={async () => {
                if (cancelReason.trim().length < 3) {
                  setCancelError("Please give a short reason (for example, “Patient requested”).");
                  return;
                }
                if (await act("cancel", { action: "cancel", reason: cancelReason }, "Appointment cancelled")) setCancelOpen(false);
              }}
            >
              Yes, cancel it
            </Button>
          </>
        }
      >
        <TextAreaField
          label="Reason for cancelling"
          required
          rows={3}
          value={cancelReason}
          onChange={(e) => {
            setCancelReason(e.target.value);
            setCancelError(undefined);
          }}
          error={cancelError}
          hint="Visible to staff only."
        />
      </Dialog>

      <Dialog
        open={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
        title="Reschedule"
        size="lg"
        description={a && start && `Currently ${formatDateLong(start)} at ${formatTime(start)} with ${a.doctor.name}.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRescheduleOpen(false)} disabled={busy === "reschedule"}>
              Close
            </Button>
            <Button
              disabled={!newDate || !newTime}
              loading={busy === "reschedule"}
              onClick={async () => {
                if (await act("reschedule", { action: "reschedule", date: newDate, time: newTime }, "Appointment rescheduled")) setRescheduleOpen(false);
              }}
            >
              {newDate && newTime ? `Move to ${formatTimeString(newTime)}, ${formatDateStringLong(newDate)}` : "Choose a new date and time"}
            </Button>
          </>
        }
      >
        {a && (
          <div className="space-y-5">
            {rescheduleError && <Alert tone="error">{rescheduleError}</Alert>}
            <BookingCalendar
              doctorSlug={a.doctor.slug}
              value={newDate}
              admin
              excludeId={a.id}
              onChange={(d) => {
                setNewDate(d);
                setNewTime(undefined);
                setRescheduleError(null);
              }}
            />
            {newDate && (
              <div>
                <h3 className="mb-3 text-2xl">Times on {formatDateStringLong(newDate)}</h3>
                <SlotPicker doctorSlug={a.doctor.slug} date={newDate} value={newTime} onChange={setNewTime} admin excludeId={a.id} refreshKey={slotRefresh} />
              </div>
            )}
          </div>
        )}
      </Dialog>
    </>
  );
}
