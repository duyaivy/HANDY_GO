import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
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
      `/admin/kyc-cases/${encodeURIComponent(id)}`;

    const response = await fetch(backendUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    const rawText = await response.text();
    const result = rawText ? JSON.parse(rawText) : null;

    return NextResponse.json(result, {
      status: response.status,
    });
  } catch (error) {
    console.error("[GET /api/kyc-cases/:id]", error);

    return NextResponse.json(
      { message: "Không thể lấy chi tiết hồ sơ KYC" },
      { status: 500 },
    );
  }
}