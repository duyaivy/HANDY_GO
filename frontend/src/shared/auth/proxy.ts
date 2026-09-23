import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ROUTE } from "@/shared/constants/route";
import { decodeToken } from "./token";
import { Role } from "../constants/type";
// route bắt buoc phải đăng nhập mới vào được
const managePaths = [ROUTE.MANAGE.ROOT];
const guestPaths = [ROUTE.GUEST.ROOT];
const privatePaths = [...managePaths, ...guestPaths];
// route dành cho người chưa đăng nhập
const unAuthPaths = [ROUTE.AUTH.LOGIN];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const accessToken = request.cookies.get("accessToken")?.value;
  const refreshToken = request.cookies.get("refreshToken")?.value;

  // 1. chưa đăng nhâpk thì không vào privatePaths
  if (privatePaths.some((path) => pathname.startsWith(path)) && !refreshToken) {
    return NextResponse.redirect(new URL(ROUTE.AUTH.LOGIN, request.url));
  }
  // 2. CHUA DANG NHAP
  if(refreshToken){
    // 2.1 co tinh vao login
    if (unAuthPaths.some((path) => pathname.startsWith(path)) && refreshToken) {
    return NextResponse.redirect(new URL(ROUTE.HOME, request.url));
  }
  // 2.2 accessToken het han
  if (
    privatePaths.some((path) => pathname.startsWith(path)) &&
    !accessToken 
  ) {
    const url = new URL(ROUTE.AUTH.REFRESH_TOKEN, request.url);
    url.searchParams.set("refreshToken", refreshToken);
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }
  // 2.3 vao khong dung role -> home
  const role = decodeToken(refreshToken)?.role;
  // guest co vao owner
  const isGuestGoToManagePaths = role === Role.Guest && managePaths.some((path) => pathname.startsWith(path));
  //  vao guest
  const isOwnerGoToGuestPaths = role !== Role.Guest && guestPaths.some((path) => pathname.startsWith(path));
  
  if(isOwnerGoToGuestPaths){
    return NextResponse.redirect(new URL(ROUTE.HOME, request.url));
  }
  if(isGuestGoToManagePaths){
    return NextResponse.redirect(new URL(ROUTE.GUEST.MENU, request.url));
  }
  return NextResponse.next();

  }
}
export const config = {
  matcher: ["/manage/:path*","/guest/:path*", "/login"],
};