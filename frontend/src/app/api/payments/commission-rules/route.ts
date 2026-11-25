import { cookies } from "next/headers";

async function proxyCommissionRules(request: Request, body?: string) {
  const accessToken = (await cookies()).get("accessToken")?.value;
  if (!accessToken) {
    return Response.json({ message: "Bạn chưa đăng nhập" }, { status: 401 });
  }

  const apiEndpoint = process.env.NEXT_PUBLIC_API_ENDPOINT;
  if (!apiEndpoint) {
    return Response.json({ message: "Chưa cấu hình Backend API" }, { status: 500 });
  }

  try {
    const url = new URL(`${apiEndpoint.replace(/\/+$/, "")}/payments/admin/commission-rules`);
    const headers = new Headers({
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    });

    if (body === undefined) {
      const { searchParams } = new URL(request.url);
      for (const key of ["page", "limit"]) {
        const value = searchParams.get(key);
        if (value !== null) url.searchParams.set(key, value);
      }
    } else {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(url, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      signal: request.signal,
    });

    return Response.json(await response.json(), {
      status: response.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Không thể kết nối API quy tắc hoa hồng", error);
    return Response.json({ message: "Không thể kết nối API quy tắc hoa hồng" }, { status: 502 });
  }
}

export function GET(request: Request) {
  return proxyCommissionRules(request);
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ message: "Origin không hợp lệ" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "Dữ liệu gửi lên không hợp lệ" }, { status: 400 });
  }

  return proxyCommissionRules(request, JSON.stringify(body));
}
