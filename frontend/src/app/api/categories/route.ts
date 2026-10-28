import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  // 1. Kiểm tra request đến từ chính website
  const origin = request.headers.get("origin");
  const expectedOrigin = new URL(request.url).origin;

  if (origin !== expectedOrigin) {
    return NextResponse.json(
      { message: "Origin không hợp lệ" },
      { status: 403 },
    );
  }

  // 2. Đọc Access Token từ HttpOnly Cookie
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("accessToken")?.value;

  if (!accessToken) {
    return NextResponse.json(
      { message: "Bạn chưa đăng nhập" },
      { status: 401 },
    );
  }

  try {
    // 3. Lấy dữ liệu từ frontend
    const body = await request.json();

    // 4. Lấy URL Backend từ env
    const apiEndpoint = process.env.NEXT_PUBLIC_API_ENDPOINT;

    if (!apiEndpoint) {
      throw new Error("Thiếu NEXT_PUBLIC_API_ENDPOINT");
    }

    // Nếu env đã có /api/v1 thì không thêm lần nữa
    const backendUrl = `${apiEndpoint.replace(/\/$/, "")}/categories`;

    // 5. Gửi POST đến Backend
    const backendResponse = await fetch(backendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    // 6. Nhận response từ Backend
    const result = await backendResponse.json();

    // 7. Trả kết quả về frontend
    return NextResponse.json(result, {
      status: backendResponse.status,
    });
  } catch (error) {
    console.error("[POST /api/categories]", error);

    return NextResponse.json(
      { message: "Không thể tạo danh mục" },
      { status: 500 },
    );
  }
}