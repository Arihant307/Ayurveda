import type { AppointmentStatus, AppointmentType, Gender } from "@prisma/client";

export const APPOINTMENT_TYPE_LABELS: Record<AppointmentType, string> = {
  FIRST_CONSULTATION: "First Consultation",
  FOLLOW_UP: "Follow-up",
  PANCHAKARMA: "Panchakarma",
  THERAPY: "Therapy",
};

export const GENDER_LABELS: Record<Gender, string> = {
  FEMALE: "Female",
  MALE: "Male",
  OTHER: "Other",
  PREFER_NOT_TO_SAY: "Prefer not to say",
};

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/** Statuses that occupy a slot. */
export const ACTIVE_STATUSES: AppointmentStatus[] = ["PENDING", "CONFIRMED", "COMPLETED"];

/** Slots starting before this hour (clinic time) are shown under "Morning", the rest "Evening". */
export const MORNING_CUTOFF_MINUTES = 15 * 60;
