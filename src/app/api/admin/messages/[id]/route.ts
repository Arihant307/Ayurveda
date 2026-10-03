import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (request: Request, { params }: Ctx) => {
  await requireAdmin("OWNER");
  const { isRead } = await parseBody(request, z.object({ isRead: z.boolean() }));
  await db.contactMessage.update({ where: { id: (await params).id }, data: { isRead } });
  return NextResponse.json({ ok: true });
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  await requireAdmin("OWNER");
  await db.contactMessage.delete({ where: { id: (await params).id } });
  return NextResponse.json({ ok: true });
});
