import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import type { Admin, AdminRole } from "@prisma/client";
import { db } from "@/lib/db";
import { SESSION_COOKIE, verifySession } from "./session";

export * from "./session";

export class AuthError extends Error {
  constructor(public status: 401 | 403, message: string) {
    super(message);
  }
}

export const hashPassword = (password: string) => bcrypt.hash(password, 12);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

export type CurrentAdmin = Pick<Admin, "id" | "email" | "name" | "role">;

/** Current signed-in, still-active admin, or null. */
export async function getCurrentAdmin(): Promise<CurrentAdmin | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  if (!session) return null;
  const admin = await db.admin.findUnique({
    where: { id: session.sub },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });
  if (!admin || !admin.isActive) return null;
  return { id: admin.id, email: admin.email, name: admin.name, role: admin.role };
}

/** For API route handlers: throws AuthError when not allowed. */
export async function requireAdmin(role?: AdminRole): Promise<CurrentAdmin> {
  const admin = await getCurrentAdmin();
  if (!admin) throw new AuthError(401, "Your session has ended. Please sign in again.");
  if (role === "OWNER" && admin.role !== "OWNER") {
    throw new AuthError(403, "Only the clinic owner can make this change.");
  }
  return admin;
}

/** For admin pages: redirects instead of throwing. */
export async function requireAdminPage(role?: AdminRole): Promise<CurrentAdmin> {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  if (role === "OWNER" && admin.role !== "OWNER") redirect("/admin?denied=1");
  return admin;
}

// ---------- Login rate limiting (database-backed, works across serverless instances) ----------

const WINDOW_MINUTES = 15;
const MAX_FAILURES_PER_EMAIL = 5;
const MAX_FAILURES_PER_IP = 20;

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "unknown").trim();
}

export async function isLoginRateLimited(email: string, ip: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);
  const [byEmail, byIp] = await Promise.all([
    db.loginAttempt.count({ where: { email, success: false, createdAt: { gte: since } } }),
    db.loginAttempt.count({ where: { ip, success: false, createdAt: { gte: since } } }),
  ]);
  return byEmail >= MAX_FAILURES_PER_EMAIL || byIp >= MAX_FAILURES_PER_IP;
}

export async function recordLoginAttempt(email: string, ip: string, success: boolean) {
  await db.loginAttempt.create({ data: { email, ip, success } });
  if (Math.random() < 0.05) {
    // Occasional cleanup of old rows.
    await db.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 7 * 86_400_000) } } });
  }
}
