import { NextResponse } from "next/server";
import { after } from "next/server";
import { createBooking } from "@/lib/booking";
import { sendBookingEmails } from "@/lib/email";
import { handle } from "@/lib/api";
import { APPOINTMENT_TYPE_LABELS } from "@/lib/constants/appointments";

/** POST /api/appointments — public booking endpoint. */
export const POST = handle(async (request: Request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const appointment = await createBooking(body);

  // Emails go out after the transaction has committed and the response is sent.
  // A failure is logged inside sendBookingEmails and never affects the booking.
  after(() => sendBookingEmails(appointment));

  return NextResponse.json(
    {
      code: appointment.code,
      startsAt: appointment.startsAt.toISOString(),
      endsAt: appointment.endsAt.toISOString(),
      status: appointment.status,
      type: appointment.type,
      typeLabel: APPOINTMENT_TYPE_LABELS[appointment.type],
      doctor: { name: appointment.doctor.name, slug: appointment.doctor.slug },
      treatment: appointment.treatment ? { name: appointment.treatment.name } : null,
      patient: {
        name: appointment.patientName,
        phone: appointment.patientPhone,
        email: appointment.patientEmail,
      },
    },
    { status: 201 },
  );
});
