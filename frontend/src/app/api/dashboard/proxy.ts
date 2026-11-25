import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import type { DashboardPeriod } from "@/feature/dashboard/types/dashboard";

const validPeriods = new Set<DashboardPeriod>([
  "today",
  "7days",
  "30days",
  "custom",
]);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export async function proxyDashboard(request: NextRequest, metric: string) {
  const period = request.nextUrl.searchParams.get("period") ?? "30days";
  if (!validPeriods.has(period as DashboardPeriod)) {
    return NextResponse.json(
      { message: "Khoảng thời gian không hợp lệ" },
      { status: 400 },
    );
  }

  const startDate = request.nextUrl.searchParams.get("startDate");
  const endDate = request.nextUrl.searchParams.get("endDate");
  if (period === "custom") {
    if (
      !startDate ||
      !endDate ||
      !datePattern.test(startDate) ||
      !datePattern.test(endDate)
    ) {
      return NextResponse.json(
        { message: "Vui lòng chọn ngày bắt đầu và kết thúc" },
        { status: 400 },
      );
    }
    const start = Date.parse(`${startDate}T00:00:00Z`);
    const end = Date.parse(`${endDate}T00:00:00Z`);
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end < start ||
      (end - start) / 86400000 >= 365
    ) {
      return NextResponse.json(
        { message: "Khoảng tùy chọn phải từ 1 đến 365 ngày" },
        { status: 400 },
      );
    }
  }

  // Dùng chung cookie với các API proxy khác (Payment, Refund, ...).
  const token = (await cookies()).get("accessToken")?.value;
  if (!token) {
    return NextResponse.json(
      { message: "Phiên đăng nhập hết hạn hoặc không tìm thấy access token" },
      { status: 401 },
    );
  }

  // Gọi qua API Gateway, không ưu tiên URL Order Service nội bộ.
  const configured = process.env.NEXT_PUBLIC_API_ENDPOINT;
  if (!configured) {
    return NextResponse.json(
      { message: "Chưa cấu hình Backend API Gateway" },
      { status: 500 },
    );
  }
  const base = configured.replace(/\/+$/, "");
  const prefix = /\/api\/v1$/.test(base) ? "" : "/api/v1";
  let target: URL;
  try {
    target = new URL(`${base}${prefix}/admin/dashboard/${metric}`);
  } catch {
    return NextResponse.json(
      { message: "URL backend không hợp lệ" },
      { status: 500 },
    );
  }
  target.searchParams.set("period", period);
  if (period === "custom" && startDate && endDate) {
    target.searchParams.set("startDate", startDate);
    target.searchParams.set("endDate", endDate);
  }

  try {
    const backend = await fetch(target, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
      // Abort khi đổi bộ lọc / rời Dashboard và giới hạn thời gian upstream.
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]),
    });
    const content = await backend.text();
    return new NextResponse(content, {
      status: backend.status,
      headers: {
        "content-type":
          backend.headers.get("content-type") || "application/json",
      },
    });
  } catch (error) {
    if (request.signal.aborted) {
      // Client đã huỷ request. Không coi đây là lỗi Gateway.
      return new NextResponse(null, { status: 499 });
    }
    if (error instanceof Error && error.name === "TimeoutError") {
      return NextResponse.json(
        { message: "Dashboard API phản hồi quá thời gian cho phép" },
        { status: 504 },
      );
    }
    console.error("[dashboard proxy]", error);
    return NextResponse.json(
      { message: "Không kết nối được API Gateway" },
      { status: 502 },
    );
  }
}
