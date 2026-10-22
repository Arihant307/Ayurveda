import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, post } from "@/lib/api";

afterEach(() => vi.unstubAllGlobals());

function stubFetch(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("api client", () => {
  it("sends the CSRF header and JSON body", async () => {
    const fn = stubFetch(200, { ok: true });
    await post("/analyze/url", { url: "example.com" });
    const [url, init] = fn.mock.calls[0];
    expect(url).toBe("/api/v1/analyze/url");
    expect(new Headers(init.headers).get("X-Requested-With")).toBe("XMLHttpRequest");
    expect(init.body).toBe(JSON.stringify({ url: "example.com" }));
  });

  it("surfaces validation errors with field names", async () => {
    stubFetch(422, { detail: "Invalid request", errors: [{ loc: ["body", "url"], msg: "Field required" }] });
    await expect(api("/analyze/url")).rejects.toThrow("Invalid request: url Field required");
  });

  it("reports model unavailability", async () => {
    stubFetch(503, { detail: "Model 'url_classifier' is not available" });
    const err = await api("/analyze/url").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(503);
  });

  it("signals 401 so the shell can redirect to login", async () => {
    stubFetch(401, { detail: "Not authenticated" });
    const seen = vi.fn();
    window.addEventListener("hs:unauthorized", seen);
    await api("/alerts").catch(() => undefined);
    expect(seen).toHaveBeenCalled();
  });

  it("network failure gives a readable message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(api("/metrics")).rejects.toThrow("Cannot reach the API server");
  });
});
