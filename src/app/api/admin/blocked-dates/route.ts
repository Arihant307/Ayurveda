import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError, handle, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { blockedDateSchema } from "@/lib/validation";
import { addDays, dateStringToDb, istDayRange } from "@/lib/datetime";

/** Add a clinic holiday (doctorId = null) or doctor leave, for one date or a range. */
export const POST = handle(async (request: Request) => {
  await requireAdmin("OWNER");
  const data = await parseBody(request, blockedDateSchema);
  const end = data.endDate ?? data.date;
  if (end < data.date) return apiError(400, "VALIDATION", "The end date must be on or after the start date.", { endDate: "The end date must be on or after the start date." });
  const dates: string[] = [];
  for (let d = data.date; d <= end && dates.length < 120; d = addDays(d, 1)) dates.push(d);
  const existing = await db.blockedDate.findMany({
    where: { doctorId: data.doctorId, date: { in: dates.map(dateStringToDb) } },
    select: { date: true },
  });
  const skip = new Set(existing.map((e) => e.date.toISOString().slice(0, 10)));
  await db.blockedDate.createMany({
    data: dates.filter((d) => !skip.has(d)).map((d) => ({ doctorId: data.doctorId, date: dateStringToDb(d), reason: data.reason ?? null })),
  });
  // Existing bookings on those dates are kept; tell the admin so they can reschedule.
  const affected = await db.appointment.count({
    where: {
      status: { in: ["PENDING", "CONFIRMED"] },
      startsAt: { gte: istDayRange(data.date).start, lt: istDayRange(dates[dates.length - 1]).end },
      ...(data.doctorId ? { doctorId: data.doctorId } : {}),
    },
  });
  return NextResponse.json({ ok: true, added: dates.length - skip.size, affected }, { status: 201 });
});
