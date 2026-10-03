import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { Prisma } from "@prisma/client";
import { AuthError } from "@/lib/auth";
import { BookingError } from "@/lib/booking";
import { fieldErrors } from "@/lib/validation";

export type ApiErrorBody = {
  error: { code: string; message: string; fieldErrors?: Record<string, string> };
};

export function apiError(status: number, code: string, message: string, extra?: Record<string, string>) {
  return NextResponse.json<ApiErrorBody>(
    { error: { code, message, ...(extra ? { fieldErrors: extra } : {}) } },
    { status },
  );
}

/** Parse a JSON body against a schema; throws ZodError on invalid input. */
export async function parseBody<T extends ZodType>(request: Request, schema: T) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    json = {};
  }
  return schema.parse(json) as import("zod").output<T>;
}

/** Wrap a route handler so every failure becomes a friendly JSON error. */
export function handle<Args extends unknown[]>(fn: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof AuthError) {
        return apiError(error.status, error.status === 401 ? "UNAUTHORISED" : "FORBIDDEN", error.message);
      }
      if (error instanceof BookingError) {
        return apiError(error.status, error.code, error.message, error.fieldErrors);
      }
      if (error instanceof ZodError) {
        return apiError(400, "VALIDATION", "Please check the highlighted details.", fieldErrors(error));
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return apiError(409, "CONFLICT", "That already exists. Please use a different value.");
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        return apiError(404, "NOT_FOUND", "We couldn't find that record. It may have been removed.");
      }
      console.error("[api] Unhandled error", error);
      return apiError(500, "SERVER_ERROR", "Something went wrong on our side. Please try again in a moment.");
    }
  };
}

/**
 * Parse a partial update. Keys sent in the body but emptied by validation
 * (e.g. a cleared optional field) become null so they are actually cleared.
 */
export async function parsePartialBody<T extends import("zod").ZodObject>(request: Request, schema: T) {
  let json: Record<string, unknown> = {};
  try {
    json = (await request.json()) as Record<string, unknown>;
  } catch {
    json = {};
  }
  const parsed = schema.partial().parse(json) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(json)) {
    if (key in schema.shape) out[key] = parsed[key] === undefined ? null : parsed[key];
  }
  return out as { [K in keyof import("zod").output<T>]?: import("zod").output<T>[K] | null };
}
