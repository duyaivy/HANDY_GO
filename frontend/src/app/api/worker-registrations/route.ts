import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { forwardBackendResponse } from "./proxy-response";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("accessToken")?.value;

  if (!accessToken) {
    return NextResponse.json(
      { message: "Bạn chưa đăng nhập" },
      { status: 401 },
    );
  }

  const apiEndpoint = process.env.NEXT_PUBLIC_API_ENDPOINT;

  if (!apiEndpoint) {
    return NextResponse.json(
      { message: "Chưa cấu hình Backend API" },
      { status: 500 },
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const queryParams = new URLSearchParams();

    for (const key of ["status", "page", "limit", "search", "sortBy"]) {
      const value = searchParams.get(key);
      if (value) queryParams.set(key, value);
    }

    const queryString = queryParams.toString();

    const backendUrl =
      `${apiEndpoint.replace(/\/$/, "")}/admin/worker-registrations` +
      (queryString ? `?${queryString}` : "");

    const response = await fetch(backendUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    return await forwardBackendResponse(
      response,
      "Không thể lấy danh sách đăng ký làm việc",
    );
  } catch (error) {
    console.error("[GET /api/worker-registrations]", error);

    return NextResponse.json(
      { message: "Không thể kết nối đến Backend" },
      { status: 502 },
    );
  }
}
