import { cookies } from "next/headers";

type OperationProxyOptions = {
  request: Request;
  method: "GET" | "POST";
  backendPath: string;
  queryKeys?: string[];
};

export async function proxyOperationRequest({
  request,
  method,
  backendPath,
  queryKeys = [],
}: OperationProxyOptions) {
  if (method === "POST" && request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ message: "Origin không hợp lệ" }, { status: 403 });
  }

  const accessToken = (await cookies()).get("accessToken")?.value;
  if (!accessToken) return Response.json({ message: "Bạn chưa đăng nhập" }, { status: 401 });

  const apiEndpoint = process.env.NEXT_PUBLIC_API_ENDPOINT;
  if (!apiEndpoint) return Response.json({ message: "Chưa cấu hình Backend API" }, { status: 500 });

  let body: string | undefined;
  if (method === "POST") {
    try {
      body = JSON.stringify(JSON.parse(await request.text()));
    } catch {
      return Response.json({ message: "Dữ liệu gửi lên không hợp lệ" }, { status: 400 });
    }
  }

  try {
    const url = new URL(`${apiEndpoint.replace(/\/+$/, "")}/${backendPath.replace(/^\/+/, "")}`);
    const sourceUrl = new URL(request.url);
    for (const key of queryKeys) {
      const value = sourceUrl.searchParams.get(key);
      if (value !== null) url.searchParams.set(key, value);
    }
    const response = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body,
      cache: "no-store",
      signal: request.signal,
    });
    const rawResponse = await response.text();
    try {
      return Response.json(rawResponse ? JSON.parse(rawResponse) : null, {
        status: response.status,
        headers: { "Cache-Control": "no-store" },
      });
    } catch {
      return Response.json({ message: "Backend trả về dữ liệu không hợp lệ" }, { status: 502 });
    }
  } catch (error) {
    console.error("Không thể kết nối API vận hành thanh toán", error);
    return Response.json({ message: "Không thể kết nối API vận hành thanh toán" }, { status: 502 });
  }
}
