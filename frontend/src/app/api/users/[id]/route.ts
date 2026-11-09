import { NextRequest, NextResponse } from "next/server";

const API_ENDPOINT = process.env.NEXT_PUBLIC_API_ENDPOINT;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  if (!API_ENDPOINT) {
    return NextResponse.json(
      { message: "Chưa cấu hình API endpoint" },
      { status: 500 },
    );
  }

  const accessToken = request.cookies.get("accessToken")?.value;

  if (!accessToken) {
    return NextResponse.json(
      { message: "Chưa đăng nhập" },
      { status: 401 },
    );
  }

  try {
    const response = await fetch(
      `${API_ENDPOINT.replace(/\/$/, "")}/users/${encodeURIComponent(id)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
      },
    );

    const data = await response.json();

    return NextResponse.json(data, {
      status: response.status,
    });
  } catch {
    return NextResponse.json(
      { message: "Không thể lấy thông tin người dùng" },
      { status: 502 },
    );
  }
}