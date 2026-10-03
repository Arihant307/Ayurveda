/**
 * Booking service: the only place appointments are created or moved.
 * Used by the public booking API, admin rescheduling, and the concurrency test.
 */
import "server-only";
import { Prisma, type Appointment, type AppointmentStatus, type Doctor, type Treatment } from "@prisma/client";
import { db } from "@/lib/db";
import { checkSlotBookable, type SlotCheck } from "@/lib/availability";
import { formatDateTime, istDayRange, istParts } from "@/lib/datetime";
import { bookingSchema, fieldErrors, type BookingInput, type BookingData } from "@/lib/validation";

export class BookingError extends Error {
  constructor(
    public code:
      | "VALIDATION"
      | "DOCTOR_NOT_FOUND"
      | "SLOT_TAKEN"
      | "SLOT_UNAVAILABLE"
      | "DUPLICATE"
      | "NOT_FOUND"
      | "INVALID_STATE",
    message: string,
    public status: number,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}

export const SLOT_TAKEN_MESSAGE = "That time was just booked — please pick another.";

export type BookedAppointment = Appointment & { doctor: Doctor; treatment: Treatment | null };

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

/** KA-YYMM-XXXX, where YYMM is the booking month in clinic time. */
export function generateAppointmentCode(now = new Date()): string {
  const p = istParts(now);
  const yymm = `${String(p.year).slice(2)}${String(p.month).padStart(2, "0")}`;
  let suffix = "";
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  for (const b of bytes) suffix += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return `KA-${yymm}-${suffix}`;
}

function slotErrorFrom(check: Exclude<SlotCheck, { ok: true }>): BookingError {
  if (check.reason === "booked") return new BookingError("SLOT_TAKEN", SLOT_TAKEN_MESSAGE, 409);
  if (check.reason === "too-soon")
    return new BookingError(
      "SLOT_UNAVAILABLE",
      "That time is too close to now to book online — please pick a later time or call us.",
      409,
    );
  return new BookingError(
    "SLOT_UNAVAILABLE",
    "That time is no longer available — please pick another.",
    409,
  );
}

function isActiveSlotConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const target = JSON.stringify(error.meta ?? {});
    return !target.includes("code");
  }
  // Raw driver error surfaced as unknown request error
  return error instanceof Error && /Appointment_doctor_slot_active_key/.test(error.message);
}

/** Serialise competing writers for the same key until the transaction ends. */
async function advisoryLock(tx: Prisma.TransactionClient, key: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

async function uniqueCode(tx: Prisma.TransactionClient): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = generateAppointmentCode();
    const exists = await tx.appointment.findUnique({ where: { code }, select: { id: true } });
    if (!exists) return code;
  }
  throw new Error("Could not generate a unique appointment code");
}

export async function createBooking(raw: BookingInput | unknown, now = new Date()): Promise<BookedAppointment> {
  const parsed = bookingSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BookingError("VALIDATION", "Please check the highlighted details.", 400, fieldErrors(parsed.error));
  }
  const input: BookingData = parsed.data;

  const doctor = await db.doctor.findFirst({ where: { slug: input.doctorSlug, isActive: true } });
  if (!doctor) {
    throw new BookingError("DOCTOR_NOT_FOUND", "That doctor is not available for online booking. Please choose another.", 404);
  }
  const treatment = input.treatmentSlug
    ? await db.treatment.findFirst({ where: { slug: input.treatmentSlug, isVisible: true } })
    : null;

  try {
    return await db.$transaction(
      async (tx) => {
        // One booking at a time per doctor-day and per phone number.
        await advisoryLock(tx, `slot:${doctor.id}:${input.date}`);
        await advisoryLock(tx, `phone:${input.phone}`);

        const check = await checkSlotBookable(doctor.id, input.date, input.time, { client: tx, now });
        if (!check.ok) throw slotErrorFrom(check);

        const day = istDayRange(input.date);
        const duplicate = await tx.appointment.findFirst({
          where: {
            doctorId: doctor.id,
            patientPhone: input.phone,
            status: { in: ["PENDING", "CONFIRMED"] },
            startsAt: { gte: day.start, lt: day.end },
          },
          select: { code: true },
        });
        if (duplicate) {
          throw new BookingError(
            "DUPLICATE",
            `You already have an appointment with ${doctor.name} on this day (ref. ${duplicate.code}). Please call us if you need to change it.`,
            409,
          );
        }

        const patient = await tx.patient.upsert({
          where: { phone: input.phone },
          create: {
            phone: input.phone,
            name: input.fullName,
            email: input.email ?? null,
            age: input.age,
            gender: input.gender,
          },
          update: {
            name: input.fullName,
            age: input.age,
            gender: input.gender,
            ...(input.email ? { email: input.email } : {}),
          },
        });

        const appointment = await tx.appointment.create({
          data: {
            code: await uniqueCode(tx),
            doctorId: doctor.id,
            patientId: patient.id,
            treatmentId: treatment?.id ?? null,
            startsAt: check.slot.startsAt,
            endsAt: check.slot.endsAt,
            type: input.type,
            patientName: input.fullName,
            patientPhone: input.phone,
            patientEmail: input.email ?? null,
            patientAge: input.age,
            patientGender: input.gender,
            reason: input.reason,
            message: input.message ?? null,
            logs: { create: { action: "CREATED", toStatus: "PENDING", note: "Booked online" } },
          },
          include: { doctor: true, treatment: true },
        });
        return appointment;
      },
      { timeout: 15_000, maxWait: 10_000 },
    );
  } catch (error) {
    if (error instanceof BookingError) throw error;
    if (isActiveSlotConflict(error)) throw new BookingError("SLOT_TAKEN", SLOT_TAKEN_MESSAGE, 409);
    throw error;
  }
}

// ---------- Admin status changes ----------

const ALLOWED: Record<AppointmentStatus, AppointmentStatus[]> = {
  PENDING: ["CONFIRMED", "COMPLETED", "CANCELLED"],
  CONFIRMED: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export async function changeStatus(
  appointmentId: string,
  to: AppointmentStatus,
  adminId: string,
  note?: string,
) {
  return db.$transaction(async (tx) => {
    const current = await tx.appointment.findUnique({ where: { id: appointmentId } });
    if (!current) throw new BookingError("NOT_FOUND", "This appointment could not be found.", 404);
    if (!ALLOWED[current.status].includes(to)) {
      throw new BookingError(
        "INVALID_STATE",
        `This appointment is already ${current.status.toLowerCase()} and can't be changed to ${to.toLowerCase()}.`,
        409,
      );
    }
    return tx.appointment.update({
      where: { id: appointmentId },
      data: {
        status: to,
        ...(to === "CANCELLED" ? { cancelReason: note ?? null } : {}),
        logs: {
          create: {
            action: to === "CANCELLED" ? "CANCELLED" : to === "CONFIRMED" ? "CONFIRMED" : "COMPLETED",
            fromStatus: current.status,
            toStatus: to,
            note: note ?? null,
            adminId,
          },
        },
      },
    });
  });
}

export async function rescheduleAppointment(
  appointmentId: string,
  date: string,
  time: string,
  adminId: string,
  note?: string,
) {
  try {
    return await db.$transaction(
      async (tx) => {
        const current = await tx.appointment.findUnique({ where: { id: appointmentId } });
        if (!current) throw new BookingError("NOT_FOUND", "This appointment could not be found.", 404);
        if (current.status === "CANCELLED" || current.status === "COMPLETED") {
          throw new BookingError(
            "INVALID_STATE",
            "Cancelled or completed appointments can't be rescheduled.",
            409,
          );
        }
        await advisoryLock(tx, `slot:${current.doctorId}:${date}`);
        const check = await checkSlotBookable(current.doctorId, date, time, {
          client: tx,
          excludeAppointmentId: current.id,
          ignoreLeadTime: true,
        });
        if (!check.ok) throw slotErrorFrom(check);

        return tx.appointment.update({
          where: { id: current.id },
          data: {
            startsAt: check.slot.startsAt,
            endsAt: check.slot.endsAt,
            logs: {
              create: {
                action: "RESCHEDULED",
                fromStatus: current.status,
                toStatus: current.status,
                note: [`Moved from ${formatDateTime(current.startsAt)} to ${formatDateTime(check.slot.startsAt)}`, note]
                  .filter(Boolean)
                  .join(" — "),
                adminId,
              },
            },
          },
        });
      },
      { timeout: 15_000, maxWait: 10_000 },
    );
  } catch (error) {
    if (error instanceof BookingError) throw error;
    if (isActiveSlotConflict(error)) throw new BookingError("SLOT_TAKEN", SLOT_TAKEN_MESSAGE, 409);
    throw error;
  }
}
