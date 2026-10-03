import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError, handle } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";

const MAX_BYTES = 3 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Upload an image (doctor photo / treatment image). Stored in Postgres; served by /api/uploads/[id]. */
export const POST = handle(async (request: Request) => {
  await requireAdmin("OWNER");
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return apiError(400, "VALIDATION", "Please choose an image to upload.");
  if (!TYPES.has(file.type)) return apiError(400, "VALIDATION", "Please upload a JPG, PNG or WebP image.");
  if (file.size > MAX_BYTES) return apiError(400, "VALIDATION", "That image is too large. Please use one under 3 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const upload = await db.upload.create({ data: { mimeType: file.type, data: bytes, size: bytes.length } });
  return NextResponse.json({ url: `/api/uploads/${upload.id}` }, { status: 201 });
});
