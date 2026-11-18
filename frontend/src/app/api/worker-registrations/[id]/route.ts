import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { forwardBackendResponse } from "../proxy-response";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("accessToken")?.value;

  if (!accessToken) {
    return NextResponse.json(
      { message: "Bạn chưa đăng nhập" },
      { status: 401 },
    );
  }

  const { id } = await context.params;
  const apiEndpoint = process.env.NEXT_PUBLIC_API_ENDPOINT;

  if (!apiEndpoint) {
    return NextResponse.json(
      { message: "Chưa cấu hình Backend API" },
      { status: 500 },
    );
  }

  try {
    const backendUrl =
      `${apiEndpoint.replace(/\/$/, "")}` +
      `/admin/worker-registrations/${encodeURIComponent(id)}`;

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
      "Không thể lấy chi tiết đăng ký làm việc",
    );
  } catch (error) {
    console.error("[GET /api/worker-registrations/:id]", error);

    return NextResponse.json(
      { message: "Không thể kết nối đến Backend" },
      { status: 502 },
    );
  }
}
