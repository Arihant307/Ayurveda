import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSlotsForDate } from "@/lib/availability";
import { toSlotDTO } from "@/lib/availability/serialize";
import { isValidDateString } from "@/lib/datetime";
import { apiError, handle } from "@/lib/api";
import { getCurrentAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/availability/slots?doctor=slug&date=YYYY-MM-DD
 * Admins may add &admin=1&exclude=<appointmentId> when rescheduling.
 */
export const GET = handle(async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const slug = params.get("doctor") ?? "";
  const date = params.get("date") ?? "";
  if (!isValidDateString(date)) return apiError(400, "VALIDATION", "Please choose a valid date.");

  const asAdmin = params.get("admin") === "1" && !!(await getCurrentAdmin());
  const doctor = await db.doctor.findFirst({
    where: { slug, ...(asAdmin ? {} : { isActive: true }) },
    select: { id: true },
  });
  if (!doctor) return apiError(404, "DOCTOR_NOT_FOUND", "That doctor is not available for online booking.");

  const { status, slots } = await getSlotsForDate(doctor.id, date, {
    excludeAppointmentId: asAdmin ? (params.get("exclude") ?? undefined) : undefined,
    ignoreLeadTime: asAdmin,
  });
  return NextResponse.json(
    { date, status, slots: slots.filter((s) => s.available).map(toSlotDTO) },
    { headers: { "Cache-Control": "no-store" } },
  );
});
