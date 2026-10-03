import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { doctorSchema, slugify } from "@/lib/validation";
import { revalidatePublicSite } from "@/lib/revalidate";

/** Create a doctor with the clinic's default weekly schedule (editable in Schedules). */
export const POST = handle(async (request: Request) => {
  await requireAdmin("OWNER");
  const data = await parseBody(request, doctorSchema);
  const slug = data.slug || slugify(data.name);
  const doctor = await db.doctor.create({
    data: {
      ...data,
      slug,
      availability: {
        create: [1, 2, 3, 4, 5, 6].flatMap((weekday) => [
          { weekday, startTime: "10:00", endTime: "13:30", slotMinutes: 30 },
          { weekday, startTime: "17:00", endTime: "20:00", slotMinutes: 30 },
        ]),
      },
    },
  });
  revalidatePublicSite();
  return NextResponse.json({ id: doctor.id }, { status: 201 });
});
