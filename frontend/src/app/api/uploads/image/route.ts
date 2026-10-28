import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const expectedOrigin = new URL(request.url).origin;

  if (origin !== expectedOrigin) {
    return NextResponse.json(
      { message: "Origin không hợp lệ" },
      { status: 403 },
    );
  }

  const cookieStore = await cookies();
  const accessToken = cookieStore.get("accessToken")?.value;

  if (!accessToken) {
    return NextResponse.json(
      { message: "Bạn chưa đăng nhập" },
      { status: 401 },
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { message: "Vui lòng chọn ảnh" },
        { status: 400 },
      );
    }

    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type)
    ) {
      return NextResponse.json(
        { message: "Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP" },
        { status: 400 },
      );
    }

    const apiEndpoint = process.env.NEXT_PUBLIC_API_ENDPOINT;

    if (!apiEndpoint) {
      throw new Error("Chưa cấu hình NEXT_PUBLIC_API_ENDPOINT");
    }

    // Giả định env đã bao gồm /api/v1
    const backendUrl =
      `${apiEndpoint.replace(/\/$/, "")}/uploads/image`;

    const uploadData = new FormData();
    uploadData.append("file", file);

    const response = await fetch(backendUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: uploadData,
      cache: "no-store",
    });

    const result = await response.json();

    return NextResponse.json(result, {
      status: response.status,
    });
  } catch (error) {
    console.error("[POST /api/uploads/image]", error);

    return NextResponse.json(
      { message: "Upload ảnh thất bại" },
      { status: 500 },
    );
  }
}