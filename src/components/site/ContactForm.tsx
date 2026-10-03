"use client";

import { useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { contactSchema, fieldErrors, type ContactInput } from "@/lib/validation";
import { apiFetch } from "@/lib/client-api";
import { Button } from "@/components/ui/Button";
import { TextAreaField, TextField } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";

const EMPTY: ContactInput = { name: "", phone: "", email: "", subject: "", message: "", website: "" };

export function ContactForm() {
  const [values, setValues] = useState<ContactInput>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [formError, setFormError] = useState<string | null>(null);

  const set = (key: keyof ContactInput) => (e: { target: { value: string } }) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    if (errors[key]) setErrors(({ [key]: _omit, ...rest }) => rest);
  };

  const validateField = (key: keyof ContactInput) => {
    const result = contactSchema.safeParse(values);
    const next = result.success ? {} : fieldErrors(result.error);
    setErrors((prev) => {
      const { [key]: _old, ...rest } = prev;
      return next[key] ? { ...rest, [key]: next[key] } : rest;
    });
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = contactSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setStatus("sending");
    try {
      const res = await apiFetch("/api/contact", { method: "POST", json: values });
      if (res.ok) {
        setStatus("sent");
        setValues(EMPTY);
        return;
      }
      if (res.fieldErrors) setErrors(res.fieldErrors);
      setFormError(res.message);
      setStatus("idle");
    } catch {
      setFormError("Something went wrong. Please try again or call us.");
      setStatus("idle");
    }
  }

  if (status === "sent") {
    return (
      <Alert tone="success" title="Thank you — your message has been sent." className="mt-6">
        Our team will get back to you during clinic hours.{" "}
        <button type="button" className="font-semibold underline underline-offset-4" onClick={() => setStatus("idle")}>
          Send another message
        </button>
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-6 space-y-5">
      {formError && <Alert tone="error">{formError}</Alert>}
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField label="Your name" name="name" autoComplete="name" required value={values.name} onChange={set("name")} onBlur={() => validateField("name")} error={errors.name} />
        <TextField
          label="Mobile number"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          required
          value={values.phone}
          onChange={set("phone")}
          onBlur={() => validateField("phone")}
          error={errors.phone}
          hint="10-digit Indian mobile number"
        />
      </div>
      <TextField label="Email" name="email" type="email" autoComplete="email" optional value={values.email} onChange={set("email")} onBlur={() => validateField("email")} error={errors.email} />
      <TextField label="Subject" name="subject" optional value={values.subject} onChange={set("subject")} error={errors.subject} />
      <TextAreaField label="Message" name="message" required rows={5} value={values.message} onChange={set("message")} onBlur={() => validateField("message")} error={errors.message} />
      {/* Honeypot field: hidden from people, tempting for bots */}
      <div className="absolute -left-[9999px]" aria-hidden="true">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={values.website} onChange={set("website")} />
        </label>
      </div>
      <Button type="submit" size="lg" loading={status === "sending"} loadingText="Sending…" icon={<Send className="size-4" aria-hidden="true" />} className="w-full sm:w-auto">
        Send message
      </Button>
    </form>
  );
}
