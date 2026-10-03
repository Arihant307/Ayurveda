import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { testimonialSchema } from "@/lib/validation";
import { revalidatePublicSite } from "@/lib/revalidate";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (request: Request, { params }: Ctx) => {
  await requireAdmin("OWNER");
  const data = await parseBody(request, testimonialSchema.partial());
  await db.testimonial.update({ where: { id: (await params).id }, data });
  revalidatePublicSite();
  return NextResponse.json({ ok: true });
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  await requireAdmin("OWNER");
  await db.testimonial.delete({ where: { id: (await params).id } });
  revalidatePublicSite();
  return NextResponse.json({ ok: true });
});
