import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { weeklyScheduleSchema } from "@/lib/validation";
import { revalidatePublicSite } from "@/lib/revalidate";

type Ctx = { params: Promise<{ id: string }> };

/** Replace a doctor's weekly sessions. Existing appointments are never touched. */
export const PUT = handle(async (request: Request, { params }: Ctx) => {
  await requireAdmin("OWNER");
  const { id } = await params;
  const { days } = await parseBody(request, weeklyScheduleSchema);
  await db.$transaction([
    db.doctorAvailability.deleteMany({ where: { doctorId: id } }),
    db.doctorAvailability.createMany({
      data: days.flatMap((d) => d.sessions.map((s) => ({ doctorId: id, weekday: d.weekday, ...s }))),
    }),
  ]);
  revalidatePublicSite();
  return NextResponse.json({ ok: true });
});
