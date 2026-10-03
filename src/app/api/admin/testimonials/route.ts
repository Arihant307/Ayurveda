import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { testimonialSchema } from "@/lib/validation";
import { revalidatePublicSite } from "@/lib/revalidate";

export const POST = handle(async (request: Request) => {
  await requireAdmin("OWNER");
  const data = await parseBody(request, testimonialSchema);
  const t = await db.testimonial.create({ data });
  revalidatePublicSite();
  return NextResponse.json({ id: t.id }, { status: 201 });
});
