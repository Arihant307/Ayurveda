import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loginSchema } from "@/lib/validation";
import { apiError, handle, parseBody } from "@/lib/api";
import {
  SESSION_COOKIE,
  clientIp,
  hashPassword,
  isLoginRateLimited,
  recordLoginAttempt,
  sessionCookieOptions,
  signSession,
  verifyPassword,
} from "@/lib/auth";

// Compared against when the email doesn't exist, so response time doesn't reveal valid emails.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hashPassword("not-a-real-password"));

export const POST = handle(async (request: Request) => {
  const { email, password } = await parseBody(request, loginSchema);
  const ip = await clientIp();

  if (await isLoginRateLimited(email, ip)) {
    return apiError(429, "RATE_LIMITED", "Too many attempts. Please wait 15 minutes and try again.");
  }

  const admin = await db.admin.findUnique({ where: { email } });
  const ok = await verifyPassword(password, admin?.passwordHash ?? (await getDummyHash()));
  if (!admin || !ok || !admin.isActive) {
    await recordLoginAttempt(email, ip, false);
    return apiError(401, "INVALID_CREDENTIALS", "That email and password don't match. Please try again.");
  }

  await recordLoginAttempt(email, ip, true);
  await db.admin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
  const token = await signSession({ sub: admin.id, role: admin.role, name: admin.name });
  const response = NextResponse.json({ ok: true, name: admin.name, role: admin.role });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return response;
});
