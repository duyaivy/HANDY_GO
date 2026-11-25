import { cookies } from "next/headers";

const QUERY_KEYS = ["page", "limit", "status", "method"];

export async function proxyPaymentRecords(request: Request, id?: string) {
  const accessToken = (await cookies()).get("accessToken")?.value;
  if (!accessToken) {
    return Response.json({ message: "Bạn chưa đăng nhập" }, { status: 401 });
  }

  const apiEndpoint = process.env.NEXT_PUBLIC_API_ENDPOINT;
  if (!apiEndpoint) {
    return Response.json(
      { message: "Chưa cấu hình Backend API" },
      { status: 500 },
    );
  }

  try {
    const recordsUrl = `${apiEndpoint.replace(/\/+$/, "")}/payments/admin/records`;
    const url = new URL(id ? `${recordsUrl}/${encodeURIComponent(id)}` : recordsUrl);
    if (!id) {
      const { searchParams } = new URL(request.url);
      for (const key of QUERY_KEYS) {
        const value = searchParams.get(key);
        if (value !== null) url.searchParams.set(key, value);
      }
    }

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
      signal: request.signal,
    });

    return Response.json(await response.json(), {
      status: response.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Không thể tải dữ liệu thanh toán từ Backend", error);
    return Response.json(
      { message: "Không thể tải dữ liệu thanh toán từ Backend" },
      { status: 502 },
    );
  }
}
