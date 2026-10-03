/**
 * Zod schemas shared by client forms and server handlers.
 * Import only from this module so client and server always agree.
 */
import { z } from "zod";
import { TIME_RE, isValidDateString } from "@/lib/datetime";

export const APPOINTMENT_TYPES = ["FIRST_CONSULTATION", "FOLLOW_UP", "PANCHAKARMA", "THERAPY"] as const;
export const GENDERS = ["FEMALE", "MALE", "OTHER", "PREFER_NOT_TO_SAY"] as const;
export const APPOINTMENT_STATUSES = ["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED"] as const;

/** Strip spaces, dashes, brackets, a leading +91 / 91 / 0. Returns 10 digits if possible. */
export function normalizeIndianPhone(raw: string): string {
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+91")) digits = digits.slice(3);
  else if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits.replace(/\D/g, "");
}

const trimmed = (min: number, max: number, label: string) =>
  z
    .string({ error: `Please enter ${label}.` })
    .trim()
    .min(1, `Please enter ${label}.`)
    .min(min, `${capitalise(label)} looks too short.`)
    .max(max, `${capitalise(label)} must be ${max} characters or fewer.`);

function capitalise(s: string) {
  return s.replace(/^(your |a |the )/, "").replace(/^./, (c) => c.toUpperCase());
}

export const phoneSchema = z
  .string({ error: "Please enter your mobile number." })
  .transform(normalizeIndianPhone)
  .pipe(
    z
      .string()
      .min(1, "Please enter your mobile number.")
      .regex(/^[6-9]\d{9}$/, "Please enter a valid 10-digit Indian mobile number."),
  );

/** Optional email: empty string → undefined. */
export const optionalEmailSchema = z
  .string()
  .trim()
  .max(120, "Email must be 120 characters or fewer.")
  .optional()
  .transform((v) => (v ? v : undefined))
  .pipe(z.email("Please enter a valid email address, or leave it blank.").optional());

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer.`)
    .optional()
    .transform((v) => (v ? v : undefined));

export const dateStringSchema = z
  .string()
  .refine(isValidDateString, "Please choose a valid date.");
export const timeStringSchema = z.string().regex(TIME_RE, "Please choose a valid time.");
const slugSchema = z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/);

// ---------- Booking ----------

/** Step 4 (patient details) — validated inline on the client. */
export const patientDetailsSchema = z.object({
  fullName: trimmed(2, 80, "your full name"),
  phone: phoneSchema,
  email: optionalEmailSchema,
  age: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z.coerce
      .number({ error: "Please enter your age." })
      .int("Please enter age in whole years.")
      .min(1, "Please enter a valid age.")
      .max(120, "Please enter a valid age."),
  ),
  gender: z.enum(GENDERS, { error: "Please select a gender." }),
  type: z.enum(APPOINTMENT_TYPES, { error: "Please select the appointment type." }),
  reason: trimmed(3, 500, "the reason for your visit"),
  message: optionalText(1000, "Message"),
});

export const bookingSchema = patientDetailsSchema.extend({
  doctorSlug: slugSchema,
  treatmentSlug: slugSchema.optional(),
  date: dateStringSchema,
  time: timeStringSchema,
});

export type PatientDetailsInput = z.input<typeof patientDetailsSchema>;
export type BookingInput = z.input<typeof bookingSchema>;
export type BookingData = z.output<typeof bookingSchema>;

// ---------- Contact form ----------

export const contactSchema = z.object({
  name: trimmed(2, 80, "your name"),
  phone: phoneSchema,
  email: optionalEmailSchema,
  subject: optionalText(120, "Subject"),
  message: trimmed(5, 2000, "your message"),
  /** Honeypot — must stay empty. */
  website: z.string().max(200).optional(),
});
export type ContactInput = z.input<typeof contactSchema>;

// ---------- Admin ----------

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Please enter a valid email address.")),
  password: z.string().min(1, "Please enter your password.").max(200),
});

export const cancelSchema = z.object({
  reason: trimmed(3, 500, "a reason for cancelling"),
});

export const rescheduleSchema = z.object({
  date: dateStringSchema,
  time: timeStringSchema,
  note: optionalText(500, "Note"),
});

export const appointmentActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm") }),
  z.object({ action: z.literal("complete") }),
  z.object({ action: z.literal("cancel"), reason: cancelSchema.shape.reason }),
  z.object({ action: z.literal("reschedule"), ...rescheduleSchema.shape }),
]);
export type AppointmentAction = z.input<typeof appointmentActionSchema>;

const listOfText = z
  .array(z.string().trim().min(1).max(160))
  .max(20)
  .default([]);

export const doctorSchema = z.object({
  name: trimmed(2, 80, "the doctor's name"),
  slug: slugSchema.optional(),
  qualification: optionalText(160, "Qualification"),
  specialization: optionalText(160, "Specialisation"),
  experience: optionalText(80, "Experience"),
  bio: optionalText(3000, "Biography"),
  expertise: listOfText,
  photoUrl: optionalText(300, "Photo"),
  displayOrder: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
});
export type DoctorInput = z.input<typeof doctorSchema>;

export const sessionSchema = z
  .object({
    startTime: timeStringSchema,
    endTime: timeStringSchema,
    slotMinutes: z.coerce.number().int().min(10, "Slots must be at least 10 minutes.").max(240),
  })
  .refine((s) => s.startTime < s.endTime, {
    message: "A session must end after it starts.",
    path: ["endTime"],
  });

export const weeklyScheduleSchema = z
  .object({
    days: z
      .array(
        z.object({
          weekday: z.number().int().min(0).max(6),
          sessions: z.array(sessionSchema).max(6),
        }),
      )
      .length(7),
  })
  .superRefine((value, ctx) => {
    value.days.forEach((day, dayIndex) => {
      const sorted = [...day.sessions].sort((a, b) => a.startTime.localeCompare(b.startTime));
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].startTime < sorted[i - 1].endTime) {
          ctx.addIssue({
            code: "custom",
            message: "Sessions on the same day must not overlap.",
            path: ["days", dayIndex, "sessions"],
          });
          break;
        }
      }
    });
  });
export type WeeklyScheduleInput = z.input<typeof weeklyScheduleSchema>;

export const blockedDateSchema = z.object({
  doctorId: z.string().min(1).nullable(),
  date: dateStringSchema,
  endDate: dateStringSchema.optional(),
  reason: optionalText(160, "Reason"),
});

export const settingsSchema = z.object({
  bookingWindowDays: z.coerce.number().int().min(1, "At least 1 day.").max(365, "At most 365 days."),
  minLeadMinutes: z.coerce.number().int().min(0).max(7 * 24 * 60),
});

export const treatmentSchema = z.object({
  name: trimmed(2, 100, "the treatment name"),
  slug: slugSchema.optional(),
  shortDescription: trimmed(10, 300, "a short description"),
  description: trimmed(20, 6000, "a detailed description"),
  benefits: listOfText,
  duration: optionalText(80, "Duration"),
  imageUrl: optionalText(300, "Image"),
  isFeatured: z.boolean().default(false),
  isVisible: z.boolean().default(true),
  displayOrder: z.coerce.number().int().min(0).max(999).default(0),
});
export type TreatmentInput = z.input<typeof treatmentSchema>;

export const testimonialSchema = z.object({
  patientName: trimmed(2, 80, "the patient's name"),
  context: optionalText(80, "Context"),
  content: trimmed(10, 1500, "the testimonial"),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  isPublished: z.boolean().default(false),
});

// ---------- Helpers ----------

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^dr\.?\s+/, "dr-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Map a ZodError to { field: firstMessage } for inline form errors. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
