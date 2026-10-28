import authApiRequest from "@/feature/auth/api/auth.api";
import { HttpError } from "@/shared/api/http";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const cookieStore = await cookies();
  const hasAccessToken = Boolean(cookieStore.get("accessToken")?.value);
  const hasRefreshToken = Boolean(cookieStore.get("refreshToken")?.value);

  return NextResponse.json({ hasAccessToken, hasRefreshToken });
}

export async function POST() {
  const cookieStore = await cookies();

  const refreshToken = cookieStore.get("refreshToken")?.value;

  if (!refreshToken) {
    return NextResponse.json(
      { message: "Không tìm thấy Refresh Token" },
      { status: 401 },
    );
  }

  try {
    const { payload } = await authApiRequest.sRefreshToken({
      refreshToken,
    });

    const {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn,
      user,
    } = payload.data;

    if (
      !accessToken ||
      !newRefreshToken ||
      !Number.isFinite(expiresIn) ||
      expiresIn <= 0
    ) {
      return NextResponse.json(
        { message: "Backend trả về token không hợp lệ" },
        { status: 502 },
      );
    }

    const response = NextResponse.json({
      statusCode: payload.statusCode,
      message: payload.message,
      data: {
        user,
        expiresIn,
      },
    });

    response.cookies.set("accessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: expiresIn,
    });

    response.cookies.set("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api",
    });

    return response;
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json(error.payload, { status: error.status });
    }

    console.error("[api/refresh-token]", error);

    return NextResponse.json(
      { message: "Không thể làm mới phiên đăng nhập" },
      { status: 500 },
    );
  }
}
