import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  const accessToken = (await cookies()).get("accessToken")?.value;

  if (!accessToken) {
    return NextResponse.json(
      { message: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const isActive = request.nextUrl.searchParams.get("isActive");

    if (isActive !== "true" && isActive !== "false") {
      return NextResponse.json(
        { message: "isActive không hợp lệ" },
        { status: 400 },
      );
    }

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_ENDPOINT}/services/${encodeURIComponent(id)}/status?isActive=${isActive}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      },
    );

    const data = await response.json();

    return NextResponse.json(data, {
      status: response.status,
    });
  } catch (error) {
    console.error("Lỗi cập nhật trạng thái Service:", error);

    return NextResponse.json(
      { message: "Không thể cập nhật trạng thái dịch vụ" },
      { status: 500 },
    );
  }
}