/** Browser-side fetch helper that always resolves to a friendly result. */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string; fieldErrors?: Record<string, string> };

export async function apiFetch<T>(input: string, init?: RequestInit & { json?: unknown }): Promise<ApiResult<T>> {
  const { json, ...rest } = init ?? {};
  let response: Response;
  try {
    response = await fetch(input, {
      ...rest,
      headers: {
        ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
        ...rest.headers,
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    return {
      ok: false,
      status: 0,
      code: "NETWORK",
      message: "We couldn't reach the server. Please check your internet connection and try again.",
    };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (response.ok) return { ok: true, data: body as T };

  const err = (body as { error?: { code?: string; message?: string; fieldErrors?: Record<string, string> } } | null)
    ?.error;
  if (response.status === 401 && typeof window !== "undefined" && window.location.pathname.startsWith("/admin")) {
    window.location.href = `/admin/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  }
  return {
    ok: false,
    status: response.status,
    code: err?.code ?? "UNKNOWN",
    message:
      err?.message ??
      (response.status >= 500
        ? "Something went wrong on our side. Please try again in a moment."
        : "Something went wrong. Please try again."),
    fieldErrors: err?.fieldErrors,
  };
}
