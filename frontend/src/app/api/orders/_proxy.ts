import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type ProxyOrderRequestOptions = {
  method: "GET" | "POST";
  backendPath: string;
  queryKeys?: string[];
};

export async function proxyOrderRequest(
  request: Request,
  { method, backendPath, queryKeys = [] }: ProxyOrderRequestOptions,
) {
  if (method !== "GET") {
    const origin = request.headers.get("origin");
    if (origin !== new URL(request.url).origin) {
      return NextResponse.json(
        { message: "Origin không hợp lệ" },
        { status: 403 },
      );
    }
  }

  const accessToken = (await cookies()).get("accessToken")?.value;
  if (!accessToken) {
    return NextResponse.json(
      { message: "Bạn chưa đăng nhập" },
      { status: 401 },
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

  let body: string | undefined;
  if (method === "POST") {
    const rawBody = await request.text();
    if (rawBody) {
      try {
        body = JSON.stringify(JSON.parse(rawBody));
      } catch {
        return NextResponse.json(
          { message: "Request body không hợp lệ" },
          { status: 400 },
        );
      }
    }
  }

  try {
    const backendUrl = new URL(
      `${apiEndpoint.replace(/\/+$/, "")}/${backendPath.replace(/^\/+/, "")}`,
    );
    const incomingUrl = new URL(request.url);
    for (const key of queryKeys) {
      for (const value of incomingUrl.searchParams.getAll(key)) {
        backendUrl.searchParams.append(key, value);
      }
    }

    const response = await fetch(backendUrl, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body,
      cache: "no-store",
    });

    if (response.status === 204) return new Response(null, { status: 204 });

    const rawText = await response.text();
    if (!rawText) {
      return NextResponse.json(
        response.ok
          ? { success: true, data: null }
          : { message: "Backend không trả về nội dung lỗi" },
        { status: response.status },
      );
    }

    let result: unknown;
    try {
      result = JSON.parse(rawText);
    } catch {
      console.error(
        `[${method} ${backendPath}] Backend returned non-JSON data`,
      );
      return NextResponse.json(
        { message: "Backend trả về dữ liệu không hợp lệ" },
        { status: 502 },
      );
    }
    return NextResponse.json(result, { status: response.status });
  } catch (error) {
    console.error(`[${method} ${backendPath}]`, error);
    return NextResponse.json(
      { message: "Không thể kết nối đến Backend đơn hàng" },
      { status: 502 },
    );
  }
}
