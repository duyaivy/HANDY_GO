import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
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

  const { id } = await context.params;
  const isActive = new URL(request.url).searchParams.get("isActive");

  if (isActive !== "true" && isActive !== "false") {
    return NextResponse.json(
      { message: "isActive không hợp lệ" },
      { status: 400 },
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
    const response = await fetch(
      `${apiEndpoint.replace(/\/$/, "")}/categories/${encodeURIComponent(id)}/status?isActive=${isActive}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      },
    );

    const rawText = await response.text();
    const result = rawText ? JSON.parse(rawText) : null;

    return NextResponse.json(result, {
      status: response.status,
    });
  } catch (error) {
    console.error("Update category status error:", error);

    return NextResponse.json(
      { message: "Thay đổi trạng thái thất bại" },
      { status: 500 },
    );
  }
}