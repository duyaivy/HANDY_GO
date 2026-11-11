import { NextRequest, NextResponse } from "next/server";

const API_ENDPOINT = process.env.NEXT_PUBLIC_API_ENDPOINT;

export async function GET(request: NextRequest) {
  if (!API_ENDPOINT) {
    return NextResponse.json(
      { message: "Chưa cấu hình API endpoint" },
      { status: 500 },
    );
  }

  const accessToken = request.cookies.get("accessToken")?.value;

  if (!accessToken) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;

    const endpoint = new URL(`${API_ENDPOINT.replace(/\/$/, "")}/admin/users`);

    searchParams.forEach((value, key) => {
      endpoint.searchParams.append(key, value);
    });

    const response = await fetch(endpoint.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      cache: "no-store",
    });

    const data = await response.json();

    return NextResponse.json(data, {
      status: response.status,
    });
  } catch {
    return NextResponse.json(
      { message: "Không thể lấy danh sách người dùng" },
      { status: 502 },
    );
  }
}
