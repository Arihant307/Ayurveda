import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { handle, parsePartialBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { doctorSchema, slugify } from "@/lib/validation";
import { revalidatePublicSite } from "@/lib/revalidate";

type Ctx = { params: Promise<{ id: string }> };

/** Update profile fields, or deactivate/reactivate (soft delete — history is kept). */
export const PATCH = handle(async (request: Request, { params }: Ctx) => {
  await requireAdmin("OWNER");
  const { id } = await params;
  const { slug, ...rest } = await parsePartialBody(request, doctorSchema);
  await db.doctor.update({
    where: { id },
    data: { ...(rest as Prisma.DoctorUncheckedUpdateInput), ...(slug ? { slug: slugify(slug) } : {}) },
  });
  revalidatePublicSite();
  return NextResponse.json({ ok: true });
});
