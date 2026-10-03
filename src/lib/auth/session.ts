/**
 * Edge-safe session token helpers (used by middleware and server code).
 */
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "ka_admin_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

export type AdminRoleName = "OWNER" | "STAFF";
export type SessionPayload = { sub: string; role: AdminRoleName; name: string };

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error("AUTH_SECRET must be set to at least 32 characters");
  }
  return new TextEncoder().encode(value);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ role: payload.role, name: payload.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .setIssuer("kumar-ayurveda")
    .setAudience("kumar-ayurveda-admin")
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), {
      issuer: "kumar-ayurveda",
      audience: "kumar-ayurveda-admin",
      algorithms: ["HS256"],
    });
    if (!payload.sub || (payload.role !== "OWNER" && payload.role !== "STAFF")) return null;
    return { sub: payload.sub, role: payload.role, name: String(payload.name ?? "") };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
};
