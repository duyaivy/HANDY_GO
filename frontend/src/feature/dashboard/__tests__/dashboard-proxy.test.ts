import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/dashboard/[metric]/route";
import { proxyDashboard } from "@/app/api/dashboard/proxy";

const mockCookies = vi.fn();

vi.mock("next/headers", () => ({
  cookies: () => mockCookies(),
}));

function makeCookieStore(values: Record<string, string | undefined>) {
  return {
    get: (name: string) =>
      values[name] !== undefined ? { value: values[name] } : undefined,
  };
}

describe("proxyDashboard & /api/dashboard/[metric] (HG-75 P1)", () => {
  const originalEnv = { ...process.env };
  const mockFetch = vi.fn();

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.NEXT_PUBLIC_API_ENDPOINT = "https://gateway.handygo.vn";
    delete process.env.ORDER_SERVICE_API_URL;
    delete process.env.DASHBOARD_ACCESS_TOKEN_COOKIE;
    mockCookies.mockReset();
    mockCookies.mockResolvedValue(makeCookieStore({ accessToken: "admin-jwt" }));
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it("routes requests through NEXT_PUBLIC_API_ENDPOINT gateway with accessToken cookie only", async () => {
    process.env.ORDER_SERVICE_API_URL = "http://internal-order-service:3003";
    process.env.DASHBOARD_ACCESS_TOKEN_COOKIE = "customCookie";
    mockCookies.mockResolvedValue(
      makeCookieStore({
        accessToken: "gateway-token",
        customCookie: "wrong-token",
      }),
    );
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ statusCode: 200, data: { ok: true } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const req = new NextRequest(
      "http://localhost:3000/api/dashboard/overview?period=30days",
    );
    const res = await proxyDashboard(req, "overview");

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [targetUrl, init] = mockFetch.mock.calls[0] as [URL, RequestInit];
    expect(targetUrl.toString()).toBe(
      "https://gateway.handygo.vn/api/v1/admin/dashboard/overview?period=30days",
    );
    expect(init.headers).toEqual({
      Authorization: "Bearer gateway-token",
      Accept: "application/json",
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns 401 when accessToken cookie is missing", async () => {
    mockCookies.mockResolvedValue(makeCookieStore({}));
    const req = new NextRequest(
      "http://localhost:3000/api/dashboard/overview?period=today",
    );
    const res = await proxyDashboard(req, "overview");

    expect(res.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("validates metric allowlist and custom 1..365 day range", async () => {
    const badMetricRes = await GET(
      new NextRequest("http://localhost:3000/api/dashboard/unknown?period=today"),
      { params: Promise.resolve({ metric: "unknown" }) },
    );
    expect(badMetricRes.status).toBe(404);

    // 366 ngày -> 400
    const tooLongRes = await proxyDashboard(
      new NextRequest(
        "http://localhost:3000/api/dashboard/overview?period=custom&startDate=2025-01-01&endDate=2026-01-01",
      ),
      "overview",
    );
    expect(tooLongRes.status).toBe(400);

    // 1 ngày và 365 ngày -> hợp lệ
    mockFetch.mockImplementation(
      async () =>
        new Response(JSON.stringify({ statusCode: 200, data: {} }), {
          status: 200,
        }),
    );
    const oneDayRes = await proxyDashboard(
      new NextRequest(
        "http://localhost:3000/api/dashboard/overview?period=custom&startDate=2026-11-25&endDate=2026-11-25",
      ),
      "overview",
    );
    const fullYearRes = await proxyDashboard(
      new NextRequest(
        "http://localhost:3000/api/dashboard/overview?period=custom&startDate=2026-01-01&endDate=2026-12-31",
      ),
      "overview",
    );
    expect(oneDayRes.status).toBe(200);
    expect(fullYearRes.status).toBe(200);
  });

  it("handles client abort (499), timeout (504), and gateway failure (502)", async () => {
    const controller = new AbortController();
    mockFetch.mockImplementationOnce(async () => {
      controller.abort();
      throw new DOMException("Aborted", "AbortError");
    });

    const abortRes = await proxyDashboard(
      new NextRequest(
        "http://localhost:3000/api/dashboard/overview?period=today",
        { signal: controller.signal },
      ),
      "overview",
    );
    expect(abortRes.status).toBe(499);

    const timeoutErr = new Error("Timed out");
    timeoutErr.name = "TimeoutError";
    mockFetch.mockRejectedValueOnce(timeoutErr);
    const timeoutRes = await proxyDashboard(
      new NextRequest("http://localhost:3000/api/dashboard/overview?period=today"),
      "overview",
    );
    expect(timeoutRes.status).toBe(504);

    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const badGatewayRes = await proxyDashboard(
      new NextRequest("http://localhost:3000/api/dashboard/overview?period=today"),
      "overview",
    );
    expect(badGatewayRes.status).toBe(502);
  });
});

