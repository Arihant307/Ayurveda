"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, CalendarCheck, Check, Pencil } from "lucide-react";
import {
  APPOINTMENT_TYPES,
  GENDERS,
  fieldErrors,
  patientDetailsSchema,
  type PatientDetailsInput,
} from "@/lib/validation";
import { APPOINTMENT_TYPE_LABELS, GENDER_LABELS } from "@/lib/constants/appointments";
import { formatDateStringLong, formatTimeString } from "@/lib/datetime";
import { apiFetch } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { ChoiceGroup, SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { BookingCalendar } from "./Calendar";
import { SlotPicker } from "./SlotPicker";
import { BookingSuccess, type BookingResult } from "./BookingSuccess";

export type WizardDoctor = {
  slug: string;
  name: string;
  specialization: string | null;
  qualification: string | null;
  photoUrl: string | null;
};
export type WizardTreatment = { slug: string; name: string };

const STEPS = [
  { key: "doctor", label: "Doctor" },
  { key: "date", label: "Date" },
  { key: "time", label: "Time" },
  { key: "details", label: "Details" },
  { key: "review", label: "Review" },
] as const;
type StepKey = (typeof STEPS)[number]["key"];

type State = {
  doctorSlug?: string;
  treatmentSlug?: string;
  date?: string;
  time?: string;
  details: PatientDetailsInput;
};

const EMPTY_DETAILS: PatientDetailsInput = {
  fullName: "",
  phone: "",
  email: "",
  age: "" as unknown as number,
  gender: undefined as unknown as PatientDetailsInput["gender"],
  type: undefined as unknown as PatientDetailsInput["type"],
  reason: "",
  message: "",
};

const STORAGE_KEY = "ka-booking-v1";

function loadStored(): Partial<State> | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<State>) : null;
  } catch {
    return null;
  }
}

export function BookingWizard({
  doctors,
  treatments,
}: {
  doctors: WizardDoctor[];
  treatments: WizardTreatment[];
}) {
  const searchParams = useSearchParams();
  const urlStep = (searchParams.get("step") as StepKey | null) ?? "doctor";

  const [state, setState] = useState<State>(() => ({ details: EMPTY_DETAILS }));
  const [hydrated, setHydrated] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [slotNotice, setSlotNotice] = useState<string | null>(null);
  const [slotRefresh, setSlotRefresh] = useState(0);
  const [result, setResult] = useState<BookingResult | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const doctor = doctors.find((d) => d.slug === state.doctorSlug);
  const treatment = treatments.find((t) => t.slug === state.treatmentSlug);

  // ---- Restore state: deep-link params win over the saved session ----
  useEffect(() => {
    const stored = loadStored();
    const qDoctor = searchParams.get("doctor") ?? undefined;
    const qTreatment = searchParams.get("treatment") ?? undefined;
    const next: State = { details: { ...EMPTY_DETAILS, ...(stored?.details ?? {}) } };
    next.doctorSlug = doctors.some((d) => d.slug === qDoctor) ? qDoctor : stored?.doctorSlug;
    if (!doctors.some((d) => d.slug === next.doctorSlug)) next.doctorSlug = undefined;
    next.treatmentSlug = treatments.some((t) => t.slug === qTreatment) ? qTreatment : stored?.treatmentSlug;
    if (next.doctorSlug && next.doctorSlug === stored?.doctorSlug) {
      next.date = stored?.date;
      next.time = stored?.time;
    }
    if (next.treatmentSlug === "panchakarma" && !next.details.type) next.details.type = "PANCHAKARMA";
    // A single active doctor is pre-selected.
    if (!next.doctorSlug && doctors.length === 1) next.doctorSlug = doctors[0].slug;
    setState(next);
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated || result) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage unavailable — state still lives in memory */
    }
  }, [state, hydrated, result]);

  // ---- Which step may be shown? Never skip ahead of missing data. ----
  const firstIncomplete: StepKey = !state.doctorSlug
    ? "doctor"
    : !state.date
      ? "date"
      : !state.time
        ? "time"
        : !patientDetailsSchema.safeParse(state.details).success
          ? "details"
          : "review";
  const order = STEPS.map((s) => s.key);
  const step: StepKey = order.indexOf(urlStep) > order.indexOf(firstIncomplete) ? firstIncomplete : urlStep;
  const stepIndex = order.indexOf(step);

  const goTo = useCallback(
    (next: StepKey, replace = false) => {
      const params = new URLSearchParams(window.location.search);
      params.set("step", next);
      if (state.doctorSlug) params.set("doctor", state.doctorSlug);
      if (state.treatmentSlug) params.set("treatment", state.treatmentSlug);
      const url = `${window.location.pathname}?${params}`;
      if (replace) window.history.replaceState(null, "", url);
      else window.history.pushState(null, "", url);
      setSubmitError(null);
    },
    [state.doctorSlug, state.treatmentSlug],
  );

  // Move focus to the step heading on step change (screen readers + keyboard users).
  const prevStep = useRef(step);
  useEffect(() => {
    if (prevStep.current !== step) {
      headingRef.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      prevStep.current = step;
    }
  }, [step]);

  const back = () => {
    if (stepIndex > 0) goTo(order[stepIndex - 1], true);
  };

  const setDetails = (key: keyof PatientDetailsInput, value: string) => {
    setState((s) => ({ ...s, details: { ...s.details, [key]: value } }));
    if (errors[key]) setErrors(({ [key]: _omit, ...rest }) => rest);
  };

  const validateField = (key: keyof PatientDetailsInput) => {
    const parsed = patientDetailsSchema.safeParse(state.details);
    const all = parsed.success ? {} : fieldErrors(parsed.error);
    setErrors((prev) => {
      const { [key]: _old, ...rest } = prev;
      return all[key] ? { ...rest, [key]: all[key] } : rest;
    });
  };

  function submitDetails(e: FormEvent) {
    e.preventDefault();
    const parsed = patientDetailsSchema.safeParse(state.details);
    if (!parsed.success) {
      const errs = fieldErrors(parsed.error);
      setErrors(errs);
      const first = Object.keys(errs)[0];
      document.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setErrors({});
    goTo("review");
  }

  async function confirm() {
    if (!state.doctorSlug || !state.date || !state.time) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await apiFetch<BookingResult>("/api/appointments", {
        method: "POST",
        json: {
          doctorSlug: state.doctorSlug,
          treatmentSlug: state.treatmentSlug,
          date: state.date,
          time: state.time,
          ...state.details,
        },
      });
      if (res.ok) {
        setResult(res.data);
        try {
          sessionStorage.removeItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }
        window.history.replaceState(null, "", `${window.location.pathname}?booked=${res.data.code}`);
        window.scrollTo({ top: 0 });
        return;
      }
      if (res.code === "SLOT_TAKEN" || res.code === "SLOT_UNAVAILABLE") {
        setState((s) => ({ ...s, time: undefined }));
        setSlotNotice(res.message);
        setSlotRefresh((k) => k + 1);
        goTo("time");
        return;
      }
      if (res.code === "VALIDATION" && res.fieldErrors) {
        setErrors(res.fieldErrors);
        setSubmitError(res.message);
        goTo("details");
        return;
      }
      setSubmitError(res.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (result) return <BookingSuccess result={result} />;

  if (doctors.length === 0) {
    return (
      <EmptyState title="Online booking is temporarily unavailable">
        Please call us to book your appointment — we’ll be happy to help.
      </EmptyState>
    );
  }

  const stepTitle: Record<StepKey, string> = {
    doctor: "Choose your doctor",
    date: "Pick a date",
    time: "Pick a time",
    details: "Your details",
    review: "Review and confirm",
  };

  return (
    <div className={cn("transition-opacity duration-200", !hydrated && "opacity-0")}>
      {/* ---- Progress ---- */}
      <nav aria-label="Booking progress" className="mb-6">
        <p className="mb-2 text-sm font-semibold text-muted sm:hidden">
          Step {stepIndex + 1} of {STEPS.length} · {STEPS[stepIndex].label}
        </p>
        <ol className="flex items-center gap-1.5 sm:gap-2">
          {STEPS.map((s, i) => {
            const done = i < stepIndex;
            const current = i === stepIndex;
            return (
              <li key={s.key} className="flex flex-1 items-center gap-1.5 sm:gap-2" aria-current={current ? "step" : undefined}>
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors duration-300",
                    done && "bg-navy text-white",
                    current && "bg-teal-soft text-navy-dark ring-2 ring-navy",
                    !done && !current && "bg-soft text-muted",
                  )}
                >
                  {done ? <Check className="size-4" aria-hidden="true" /> : i + 1}
                  <span className="sr-only">
                    {s.label}
                    {done ? " (completed)" : current ? " (current step)" : ""}
                  </span>
                </span>
                <span className={cn("hidden text-sm font-semibold sm:inline", current ? "text-navy" : "text-muted")} aria-hidden="true">
                  {s.label}
                </span>
                {i < STEPS.length - 1 && (
                  <span className={cn("h-1 flex-1 rounded-full transition-colors duration-300", done ? "bg-accent-gradient" : "bg-line")} aria-hidden="true" />
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="mb-5 flex items-center gap-2">
        {stepIndex > 0 && (
          <button
            type="button"
            onClick={back}
            className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-full text-navy hover:bg-navy-soft"
            aria-label="Go back to the previous step"
          >
            <ArrowLeft className="size-5" aria-hidden="true" />
          </button>
        )}
        <h2 ref={headingRef} tabIndex={-1} className="text-3xl outline-none sm:text-4xl">
          {stepTitle[step]}
        </h2>
      </div>

      {(doctor || treatment) && step !== "doctor" && step !== "review" && (
        <p className="-mt-2 mb-5 text-[0.95rem] text-muted">
          {doctor && (
            <>
              With <strong className="text-ink">{doctor.name}</strong>
            </>
          )}
          {state.date && step !== "date" && <> · {formatDateStringLong(state.date)}</>}
          {state.time && step === "details" && <> · {formatTimeString(state.time)}</>}
          {treatment && <> · {treatment.name}</>}
        </p>
      )}

      <div key={step} className="animate-fade-up">
        {/* ───────── Step 1: doctor ───────── */}
        {step === "doctor" && (
          <fieldset>
            <legend className="sr-only">Doctor</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {doctors.map((d) => {
                const checked = state.doctorSlug === d.slug;
                return (
                  <label
                    key={d.slug}
                    className={cn(
                      "flex cursor-pointer items-center gap-4 rounded-[var(--radius-card)] border-2 bg-white p-4 transition-all duration-200",
                      "has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-teal-soft hover:-translate-y-0.5 hover:shadow-soft",
                      checked ? "border-navy shadow-soft" : "border-line",
                    )}
                  >
                    <input
                      type="radio"
                      name="doctor"
                      value={d.slug}
                      checked={checked}
                      onChange={() =>
                        setState((s) => ({
                          ...s,
                          doctorSlug: d.slug,
                          ...(s.doctorSlug !== d.slug ? { date: undefined, time: undefined } : {}),
                        }))
                      }
                      className="sr-only"
                    />
                    <span className="relative size-16 shrink-0 overflow-hidden rounded-2xl bg-navy-soft">
                      <Image src={d.photoUrl || "/images/placeholders/doctor.svg"} alt="" fill sizes="64px" className="object-cover" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-serif text-2xl font-semibold text-navy">{d.name}</span>
                      {d.qualification && <span className="block text-sm font-semibold text-navy">{d.qualification}</span>}
                      {d.specialization && <span className="block text-sm text-muted">{d.specialization}</span>}
                    </span>
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                        checked ? "border-navy bg-navy text-white" : "border-line",
                      )}
                      aria-hidden="true"
                    >
                      {checked && <Check className="size-3.5 animate-pop" />}
                    </span>
                  </label>
                );
              })}
            </div>
            {treatments.length > 0 && (
              <SelectField
                className="mt-6 max-w-md"
                label="Treatment you’re interested in"
                optional
                value={state.treatmentSlug ?? ""}
                onChange={(e) => setState((s) => ({ ...s, treatmentSlug: e.target.value || undefined }))}
                hint="Not sure? Leave this blank — your doctor will guide you."
              >
                <option value="">Not sure yet</option>
                {treatments.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.name}
                  </option>
                ))}
              </SelectField>
            )}
            <StepActions>
              <Button size="lg" disabled={!state.doctorSlug} onClick={() => goTo("date")} icon={<ArrowRight className="size-5" aria-hidden="true" />} className="flex-row-reverse">
                Continue
              </Button>
            </StepActions>
          </fieldset>
        )}

        {/* ───────── Step 2: date ───────── */}
        {step === "date" && state.doctorSlug && (
          <div>
            <BookingCalendar
              doctorSlug={state.doctorSlug}
              value={state.date}
              onChange={(date) => {
                setState((s) => ({ ...s, date, ...(s.date !== date ? { time: undefined } : {}) }));
                setSlotNotice(null);
                goTo("time");
              }}
            />
            <p className="mt-3 text-sm text-muted">Use the arrow keys to move between dates. Only dates with free times can be selected.</p>
          </div>
        )}

        {/* ───────── Step 3: time ───────── */}
        {step === "time" && state.doctorSlug && state.date && (
          <div>
            {slotNotice && (
              <Alert tone="warning" className="mb-5" title={slotNotice}>
                The list below has been refreshed.
              </Alert>
            )}
            <SlotPicker
              doctorSlug={state.doctorSlug}
              date={state.date}
              value={state.time}
              refreshKey={slotRefresh}
              onChange={(time) => setState((s) => ({ ...s, time }))}
              onNoSlots={() => goTo("date")}
            />
            <StepActions>
              <Button variant="ghost" onClick={() => goTo("date")}>
                Change date
              </Button>
              <Button size="lg" disabled={!state.time} onClick={() => { setSlotNotice(null); goTo("details"); }} icon={<ArrowRight className="size-5" aria-hidden="true" />} className="flex-row-reverse">
                Continue
              </Button>
            </StepActions>
          </div>
        )}

        {/* ───────── Step 4: details ───────── */}
        {step === "details" && (
          <form onSubmit={submitDetails} noValidate className="space-y-5">
            {submitError && <Alert tone="error">{submitError}</Alert>}
            <TextField
              label="Full name"
              name="fullName"
              autoComplete="name"
              required
              value={state.details.fullName}
              onChange={(e) => setDetails("fullName", e.target.value)}
              onBlur={() => validateField("fullName")}
              error={errors.fullName}
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                label="Mobile number"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                required
                placeholder="98765 43210"
                value={state.details.phone}
                onChange={(e) => setDetails("phone", e.target.value)}
                onBlur={() => validateField("phone")}
                error={errors.phone}
                hint="10-digit Indian mobile number. We’ll call this number if needed."
              />
              <TextField
                label="Email"
                name="email"
                type="email"
                autoComplete="email"
                optional
                value={state.details.email ?? ""}
                onChange={(e) => setDetails("email", e.target.value)}
                onBlur={() => validateField("email")}
                error={errors.email}
                hint="For your confirmation email."
              />
            </div>
            <TextField
              label="Age"
              name="age"
              type="number"
              inputMode="numeric"
              min={1}
              max={120}
              required
              className="max-w-[10rem]"
              value={String(state.details.age ?? "")}
              onChange={(e) => setDetails("age", e.target.value)}
              onBlur={() => validateField("age")}
              error={errors.age}
            />
            <ChoiceGroup
              legend="Gender"
              name="gender"
              columns={4}
              value={state.details.gender}
              onChange={(v) => setDetails("gender", v)}
              error={errors.gender}
              options={GENDERS.map((g) => ({ value: g, label: GENDER_LABELS[g] }))}
            />
            <ChoiceGroup
              legend="Appointment type"
              name="type"
              columns={2}
              value={state.details.type}
              onChange={(v) => setDetails("type", v)}
              error={errors.type}
              options={APPOINTMENT_TYPES.map((t) => ({ value: t, label: APPOINTMENT_TYPE_LABELS[t] }))}
            />
            <TextAreaField
              label="Reason for visit"
              name="reason"
              required
              rows={3}
              placeholder="A few words about what you’d like help with"
              value={state.details.reason}
              onChange={(e) => setDetails("reason", e.target.value)}
              onBlur={() => validateField("reason")}
              error={errors.reason}
            />
            <TextAreaField
              label="Anything else we should know?"
              name="message"
              optional
              rows={3}
              value={state.details.message ?? ""}
              onChange={(e) => setDetails("message", e.target.value)}
              onBlur={() => validateField("message")}
              error={errors.message}
            />
            <StepActions>
              <Button type="submit" size="lg" icon={<ArrowRight className="size-5" aria-hidden="true" />} className="flex-row-reverse">
                Review booking
              </Button>
            </StepActions>
          </form>
        )}

        {/* ───────── Step 5: review ───────── */}
        {step === "review" && doctor && state.date && state.time && (
          <div>
            {submitError && <Alert tone="error" className="mb-5">{submitError}</Alert>}
            <div className="divide-y divide-line rounded-[var(--radius-card)] border border-line/70 bg-white shadow-soft">
              <ReviewBlock title="Appointment" onEdit={() => goTo("date")} editLabel="Change date or time">
                <ReviewRow label="Doctor" value={doctor.name} />
                <ReviewRow label="Date" value={formatDateStringLong(state.date)} />
                <ReviewRow label="Time" value={formatTimeString(state.time)} />
                {treatment && <ReviewRow label="Treatment" value={treatment.name} />}
              </ReviewBlock>
              <ReviewBlock title="Your details" onEdit={() => goTo("details")} editLabel="Edit your details">
                <ReviewRow label="Name" value={state.details.fullName} />
                <ReviewRow label="Mobile" value={state.details.phone} />
                <ReviewRow label="Email" value={state.details.email || "—"} />
                <ReviewRow label="Age" value={String(state.details.age)} />
                <ReviewRow label="Gender" value={state.details.gender ? GENDER_LABELS[state.details.gender] : "—"} />
                <ReviewRow label="Type" value={state.details.type ? APPOINTMENT_TYPE_LABELS[state.details.type] : "—"} />
                <ReviewRow label="Reason" value={state.details.reason} />
                {state.details.message && <ReviewRow label="Message" value={state.details.message} />}
              </ReviewBlock>
            </div>
            <p className="mt-4 text-sm text-muted">
              By confirming, you agree to our{" "}
              <a href="/terms" className="font-semibold text-navy underline underline-offset-4">terms</a> and{" "}
              <a href="/privacy" className="font-semibold text-navy underline underline-offset-4">privacy policy</a>. Our team may call
              you to confirm.
            </p>
            <StepActions>
              <Button
                size="lg"
                onClick={confirm}
                loading={submitting}
                loadingText="Confirming…"
                icon={<CalendarCheck className="size-5" aria-hidden="true" />}
                className="w-full sm:w-auto"
              >
                Confirm Appointment
              </Button>
            </StepActions>
          </div>
        )}
      </div>
    </div>
  );
}

function StepActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-5 mt-8 flex items-center justify-end gap-3 border-t border-line bg-white/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
      {children}
    </div>
  );
}

function ReviewBlock({ title, onEdit, editLabel, children }: { title: string; onEdit: () => void; editLabel: string; children: React.ReactNode }) {
  return (
    <section className="p-5 sm:p-6" aria-label={title}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-2xl">{title}</h3>
        <button type="button" onClick={onEdit} className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-navy hover:bg-navy-soft" aria-label={editLabel}>
          <Pencil className="size-4" aria-hidden="true" /> Edit
        </button>
      </div>
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[9rem_1fr]">{children}</dl>
    </section>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-sm font-semibold text-muted sm:text-[0.95rem]">{label}</dt>
      <dd className="mb-2 whitespace-pre-wrap break-words sm:mb-0">{value}</dd>
    </>
  );
}
