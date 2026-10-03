import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { slugify, treatmentSchema } from "@/lib/validation";
import { revalidatePublicSite } from "@/lib/revalidate";

export const POST = handle(async (request: Request) => {
  await requireAdmin("OWNER");
  const data = await parseBody(request, treatmentSchema);
  const t = await db.treatment.create({ data: { ...data, slug: data.slug || slugify(data.name) } });
  revalidatePublicSite();
  return NextResponse.json({ id: t.id }, { status: 201 });
});
