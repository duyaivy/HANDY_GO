import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { forwardBackendResponse } from "../../proxy-response";

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

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Dữ liệu yêu cầu không phải JSON hợp lệ" },
      { status: 400 },
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { message: "Dữ liệu xét duyệt không hợp lệ" },
      { status: 400 },
    );
  }

  const input = body as Record<string, unknown>;

  if (input.decision !== "approved" && input.decision !== "rejected") {
    return NextResponse.json(
      { message: "Quyết định xét duyệt không hợp lệ" },
      { status: 400 },
    );
  }

  if (
    typeof input.expectedVersion !== "number" ||
    !Number.isInteger(input.expectedVersion) ||
    input.expectedVersion < 1
  ) {
    return NextResponse.json(
      { message: "Phiên bản hồ sơ không hợp lệ" },
      { status: 400 },
    );
  }

  if (
    input.decision === "rejected" &&
    (typeof input.reason !== "string" || !input.reason.trim())
  ) {
    return NextResponse.json(
      { message: "Vui lòng nhập lý do từ chối" },
      { status: 400 },
    );
  }

  const requestBody =
    input.decision === "approved"
      ? {
          decision: "approved",
          expectedVersion: input.expectedVersion,
        }
      : {
          decision: "rejected",
          expectedVersion: input.expectedVersion,
          reason: (input.reason as string).trim(),
        };

  try {
    const backendUrl =
      `${apiEndpoint.replace(/\/$/, "")}` +
      `/admin/worker-registrations/${encodeURIComponent(id)}/review`;

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

    return await forwardBackendResponse(
      response,
      "Không thể xét duyệt đăng ký làm việc",
    );
  } catch (error) {
    console.error("[POST /api/worker-registrations/:id/review]", error);

    return NextResponse.json(
      { message: "Không thể kết nối đến Backend" },
      { status: 502 },
    );
  }
}
