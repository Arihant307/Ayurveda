/** Admin-side data helpers. */
import "server-only";
import type { Appointment, AppointmentLog, Doctor, Treatment, Admin } from "@prisma/client";
import { APPOINTMENT_TYPE_LABELS, GENDER_LABELS } from "@/lib/constants/appointments";
import { istDateString, istTimeString } from "@/lib/datetime";

export type AppointmentDTO = {
  id: string;
  code: string;
  status: Appointment["status"];
  type: Appointment["type"];
  typeLabel: string;
  startsAt: string;
  endsAt: string;
  date: string;
  time: string;
  doctor: { id: string; name: string; slug: string };
  treatment: string | null;
  patientName: string;
  patientPhone: string;
  patientEmail: string | null;
  patientAge: number;
  patientGender: string;
  reason: string;
  message: string | null;
  cancelReason: string | null;
  createdAt: string;
};

export type AppointmentLogDTO = {
  id: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  by: string | null;
  createdAt: string;
};

export function toAppointmentDTO(a: Appointment & { doctor: Doctor; treatment?: Treatment | null }): AppointmentDTO {
  return {
    id: a.id,
    code: a.code,
    status: a.status,
    type: a.type,
    typeLabel: APPOINTMENT_TYPE_LABELS[a.type],
    startsAt: a.startsAt.toISOString(),
    endsAt: a.endsAt.toISOString(),
    date: istDateString(a.startsAt),
    time: istTimeString(a.startsAt),
    doctor: { id: a.doctor.id, name: a.doctor.name, slug: a.doctor.slug },
    treatment: a.treatment?.name ?? null,
    patientName: a.patientName,
    patientPhone: a.patientPhone,
    patientEmail: a.patientEmail,
    patientAge: a.patientAge,
    patientGender: GENDER_LABELS[a.patientGender],
    reason: a.reason,
    message: a.message,
    cancelReason: a.cancelReason,
    createdAt: a.createdAt.toISOString(),
  };
}

export function toLogDTO(l: AppointmentLog & { admin: Pick<Admin, "name"> | null }): AppointmentLogDTO {
  return {
    id: l.id,
    action: l.action,
    fromStatus: l.fromStatus,
    toStatus: l.toStatus,
    note: l.note,
    by: l.admin?.name ?? (l.action === "CREATED" ? "Patient (online)" : null),
    createdAt: l.createdAt.toISOString(),
  };
}
