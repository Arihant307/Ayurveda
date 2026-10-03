import { NextResponse, type NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { findAppointments, parseAppointmentFilters } from "@/lib/db/appointment-search";

export const dynamic = "force-dynamic";

export const GET = handle(async (request: NextRequest) => {
  await requireAdmin();
  const filters = parseAppointmentFilters(Object.fromEntries(request.nextUrl.searchParams));
  return NextResponse.json(await findAppointments(filters));
});
