import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { settingsSchema } from "@/lib/validation";

export const PUT = handle(async (request: Request) => {
  await requireAdmin("OWNER");
  const data = await parseBody(request, settingsSchema);
  await db.clinicSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  return NextResponse.json({ ok: true });
});
