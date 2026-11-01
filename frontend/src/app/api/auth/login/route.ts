import "server-only";

import authApiRequest from "@/feature/auth/api/auth.api";

import { HttpError } from "@/shared/api/http";
import { NextResponse } from "next/server";
import { LoginBodyType } from "@/feature/auth/schemas/auth.schema";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LoginBodyType;

    if (
      typeof body.phone !== "string" ||
      typeof body.password !== "string"
    ) {
      return NextResponse.json(
        { message: "Số điện thoại hoặc mật khẩu không hợp lệ" },
        { status: 400 },
      );
    }

    const { payload } = await authApiRequest.sLogin(body);

    const {
      accessToken,
      refreshToken,
      expiresIn,
      user,
    } = payload.data;

    if (
      !accessToken ||
      !refreshToken ||
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

    response.cookies.set("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api",
    });

    return response;
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json(error.payload, {
        status: error.status,
      });
    }

    console.error("[auth/login]", error);

    return NextResponse.json(
      { message: "Đăng nhập thất bại" },
      { status: 500 },
    );
  }
}