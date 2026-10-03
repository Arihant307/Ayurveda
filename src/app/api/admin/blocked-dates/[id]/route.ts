import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";

export const DELETE = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireAdmin("OWNER");
  await db.blockedDate.delete({ where: { id: (await params).id } });
  return NextResponse.json({ ok: true });
});
