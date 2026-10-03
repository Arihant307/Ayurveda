import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getMonthCalendar } from "@/lib/availability";
import { MONTH_RE } from "@/lib/datetime";
import { apiError, handle } from "@/lib/api";
import { getCurrentAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/availability/calendar?doctor=slug&month=YYYY-MM */
export const GET = handle(async (request: NextRequest) => {
  const slug = request.nextUrl.searchParams.get("doctor") ?? "";
  const month = request.nextUrl.searchParams.get("month") ?? "";
  if (!MONTH_RE.test(month)) return apiError(400, "VALIDATION", "Please choose a valid month.");
  const doctor = await db.doctor.findFirst({ where: { slug, isActive: true }, select: { id: true } });
  if (!doctor) return apiError(404, "DOCTOR_NOT_FOUND", "That doctor is not available for online booking.");

  const asAdmin = request.nextUrl.searchParams.get("admin") === "1" && !!(await getCurrentAdmin());
  const result = await getMonthCalendar(doctor.id, month, new Date(), {
    ignoreLeadTime: asAdmin,
    excludeAppointmentId: asAdmin ? (request.nextUrl.searchParams.get("exclude") ?? undefined) : undefined,
  });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
});
