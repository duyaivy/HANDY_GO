
import "server-only";

import authApiRequest from "@/feature/auth/api/auth.api";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get("refreshToken")?.value;
  const localOnly =
    new URL(request.url).searchParams.get("localOnly") === "true";

  let revoked = false;

  if (!localOnly) {
    try {
      if (refreshToken) {
        await authApiRequest.sLogout({ refreshToken });
        revoked = true;
      }
    } catch (error) {
      console.error("[auth/logout]", error);
    }
  }

  const response = NextResponse.json({
    success: revoked,
    message: revoked
      ? "Đăng xuất thành công"
      : "Đã xóa phiên đăng nhập trên trình duyệt",
  });

  // Xóa Access Token
  response.cookies.set("accessToken", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  // Xóa Refresh Token
  response.cookies.set("refreshToken", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api",
    maxAge: 0,
  });

  return response;
}
