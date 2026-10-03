import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError, handle, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { appointmentActionSchema } from "@/lib/validation";
import { changeStatus, rescheduleAppointment } from "@/lib/booking";
import { toAppointmentDTO, toLogDTO } from "@/lib/db/admin";

type Ctx = { params: Promise<{ id: string }> };

async function load(id: string) {
  const a = await db.appointment.findUnique({
    where: { id },
    include: {
      doctor: true,
      treatment: true,
      logs: { include: { admin: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
      patient: { include: { _count: { select: { appointments: true } } } },
    },
  });
  if (!a) return null;
  return {
    appointment: toAppointmentDTO(a),
    logs: a.logs.map(toLogDTO),
    patientVisits: a.patient._count.appointments,
  };
}

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  await requireAdmin();
  const data = await load((await params).id);
  if (!data) return apiError(404, "NOT_FOUND", "This appointment could not be found.");
  return NextResponse.json(data);
});

export const PATCH = handle(async (request: Request, { params }: Ctx) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const action = await parseBody(request, appointmentActionSchema);
  switch (action.action) {
    case "confirm":
      await changeStatus(id, "CONFIRMED", admin.id);
      break;
    case "complete":
      await changeStatus(id, "COMPLETED", admin.id);
      break;
    case "cancel":
      await changeStatus(id, "CANCELLED", admin.id, action.reason);
      break;
    case "reschedule":
      await rescheduleAppointment(id, action.date, action.time, admin.id, action.note);
      break;
  }
  return NextResponse.json(await load(id));
});
