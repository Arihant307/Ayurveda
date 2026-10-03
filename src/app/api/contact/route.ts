import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contactSchema } from "@/lib/validation";
import { handle, parseBody } from "@/lib/api";

export const POST = handle(async (request: Request) => {
  const data = await parseBody(request, contactSchema);
  if (data.website) return NextResponse.json({ ok: true }); // bot: pretend success
  await db.contactMessage.create({
    data: {
      name: data.name,
      phone: data.phone,
      email: data.email ?? null,
      subject: data.subject ?? null,
      message: data.message,
    },
  });
  return NextResponse.json({ ok: true }, { status: 201 });
});
