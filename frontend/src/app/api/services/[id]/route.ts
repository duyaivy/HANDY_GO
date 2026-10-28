import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  const cookieStore = await cookies();
  const accessToken = cookieStore.get("accessToken")?.value;

  if (!accessToken) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_ENDPOINT}/services/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
        cache: "no-store",
      },
    );

    const data = await response.json();

    return NextResponse.json(data, {
      status: response.status,
    });
  } catch (error) {
    console.error("Lỗi cập nhật Service:", error);

    return NextResponse.json(
      { message: "Không thể cập nhật dịch vụ" },
      { status: 500 },
    );
  }
}
export async function DELETE(
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
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_ENDPOINT}/services/${encodeURIComponent(id)}?hard=true`,
      {
        method: "DELETE",
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
    console.error("Lỗi xóa Service:", error);

    return NextResponse.json(
      { message: "Không thể xóa dịch vụ" },
      { status: 500 },
    );
  }
}