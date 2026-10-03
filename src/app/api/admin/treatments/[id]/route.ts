import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { handle, parsePartialBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { slugify, treatmentSchema } from "@/lib/validation";
import { revalidatePublicSite } from "@/lib/revalidate";

export const PATCH = handle(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireAdmin("OWNER");
  const { slug, ...rest } = await parsePartialBody(request, treatmentSchema);
  await db.treatment.update({
    where: { id: (await params).id },
    data: { ...(rest as Prisma.TreatmentUncheckedUpdateInput), ...(slug ? { slug: slugify(slug) } : {}) },
  });
  revalidatePublicSite();
  return NextResponse.json({ ok: true });
});
