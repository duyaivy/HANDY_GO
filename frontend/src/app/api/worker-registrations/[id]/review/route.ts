import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(
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
    const body = await request.json();

    if (body.decision !== "approved" && body.decision !== "rejected") {
      return NextResponse.json(
        { message: "Quyết định xét duyệt không hợp lệ" },
        { status: 400 },
      );
    }

    if (!Number.isInteger(body.expectedVersion) || body.expectedVersion < 1) {
      return NextResponse.json(
        { message: "Phiên bản hồ sơ không hợp lệ" },
        { status: 400 },
      );
    }

    if (
      body.decision === "rejected" &&
      (typeof body.reason !== "string" || !body.reason.trim())
    ) {
      return NextResponse.json(
        { message: "Vui lòng nhập lý do từ chối" },
        { status: 400 },
      );
    }

    const backendUrl =
      `${apiEndpoint.replace(/\/$/, "")}` +
      `/admin/worker-registrations/${encodeURIComponent(id)}/review`;

    const requestBody = {
      decision: body.decision,
      expectedVersion: body.expectedVersion,
      ...(typeof body.reason === "string" && body.reason.trim()
        ? { reason: body.reason.trim() }
        : {}),
    };

    const response = await fetch(backendUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      cache: "no-store",
    });

    const rawText = await response.text();
    const result = rawText ? JSON.parse(rawText) : null;

    return NextResponse.json(result, {
      status: response.status,
    });
  } catch (error) {
    console.error("[POST /api/worker-registrations/:id/review]", error);

    return NextResponse.json(
      { message: "Không thể xét duyệt đăng ký làm việc" },
      { status: 500 },
    );
  }
}
