import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { message: "Refresh token API chưa được triển khai" },
    { status: 501 }
  );
}