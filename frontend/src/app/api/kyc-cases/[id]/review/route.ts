
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  // Kiểm tra Origin
  const origin = request.headers.get("origin");
  const expectedOrigin = new URL(request.url).origin;

  if (origin !== expectedOrigin) {
    return NextResponse.json(
      { message: "Origin không hợp lệ" },
      { status: 403 },
    );
  }

  // Lấy Access Token
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("accessToken")?.value;

  if (!accessToken) {
    return NextResponse.json(
      { message: "Bạn chưa đăng nhập" },
      { status: 401 },
    );
  }

  const { id } = await context.params;

  if (!id) {
    return NextResponse.json(
      { message: "Thiếu mã hồ sơ KYC" },
      { status: 400 },
    );
  }

  // Kiểm tra body
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Request body không hợp lệ" },
      { status: 400 },
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { message: "Dữ liệu xét duyệt không hợp lệ" },
      { status: 400 },
    );
  }

  const { decision, note } = body as Record<string, unknown>;

  if (decision !== "approved" && decision !== "rejected") {
    return NextResponse.json(
      { message: "Quyết định xét duyệt không hợp lệ" },
      { status: 400 },
    );
  }

  if (decision === "rejected" &&
      (typeof note !== "string" || !note.trim())) {
    return NextResponse.json(
      { message: "Vui lòng nhập lý do từ chối" },
      { status: 400 },
    );
  }

  if (note !== undefined && typeof note !== "string") {
    return NextResponse.json(
      { message: "Ghi chú phải là chuỗi ký tự" },
      { status: 400 },
    );
  }

  const apiEndpoint = process.env.NEXT_PUBLIC_API_ENDPOINT;

  if (!apiEndpoint) {
    console.error("Chưa cấu hình NEXT_PUBLIC_API_ENDPOINT");

    return NextResponse.json(
      { message: "Chưa cấu hình Backend API" },
      { status: 500 },
    );
  }

  const backendUrl =
    `${apiEndpoint.replace(/\/$/, "")}/admin/kyc-cases/${encodeURIComponent(id)}/review`;

  try {
    const response = await fetch(backendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        decision,
        note: typeof note === "string" ? note.trim() : "",
      }),
      cache: "no-store",
    });

    const rawText = await response.text();

    let result: unknown = null;

    if (rawText) {
      try {
        result = JSON.parse(rawText);
      } catch {
        result = {
          message: response.ok
            ? "Xét duyệt hồ sơ thành công"
            : "Backend trả về dữ liệu không hợp lệ",
        };
      }
    }

    return NextResponse.json(result, {
      status: response.status,
    });
  } catch (error) {
    console.error("[POST /api/kyc-cases/:id/review]", error);

    return NextResponse.json(
      { message: "Không thể kết nối đến Backend KYC" },
      { status: 502 },
    );
  }
}
