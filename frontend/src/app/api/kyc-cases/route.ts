import { cookies } from "next/headers";
import { NextResponse } from "next/server";

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
    // Lấy query params từ frontend
    const { searchParams } = new URL(request.url);

    const queryParams = new URLSearchParams();

    const status = searchParams.get("status");
    const page = searchParams.get("page");
    const limit = searchParams.get("limit");
    const search = searchParams.get("search");
    const sortBy = searchParams.get("sortBy");

    if (status) queryParams.set("status", status);
    if (page) queryParams.set("page", page);
    if (limit) queryParams.set("limit", limit);
    if (search) queryParams.set("search", search);
    if (sortBy) queryParams.set("sortBy", sortBy);

    const queryString = queryParams.toString();

    const backendUrl =
      `${apiEndpoint.replace(/\/$/, "")}/admin/kyc-cases` +
      (queryString ? `?${queryString}` : "");

    // Gọi Backend với Bearer Token
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
    console.error("[GET /api/kyc-cases]", error);

    return NextResponse.json(
      { message: "Không thể lấy danh sách hồ sơ KYC" },
      { status: 500 },
    );
  }
}
