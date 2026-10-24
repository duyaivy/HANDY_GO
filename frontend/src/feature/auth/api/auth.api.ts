import http from "@/shared/api/http";
import type { SuccessResponse } from "@/shared/constants/type";
import type {
  LoginBodyType,
  LoginResType,
  RefreshTokenBodyType,
  RefreshTokenResType,
  LogoutBodyType,
  AuthClientResType,
} from "../schemas/auth.schema";

const authApiRequest = {
  // Server Next.js -> Backend HandyGo
  sLogin: (body: LoginBodyType) =>
    http.post<SuccessResponse<LoginResType>>("auth/login", body),

  sRefreshToken: (body: RefreshTokenBodyType) =>
    http.post<SuccessResponse<RefreshTokenResType>>("auth/refresh", body),

  sLogout: (body: LogoutBodyType) =>
    http.post<SuccessResponse<null>>("auth/logout", body),

  // Trình duyệt -> Next.js Route Handler
  login: (body: LoginBodyType) =>
    http.post<SuccessResponse<AuthClientResType>>("/api/auth/login", body, {
      baseUrl: "",
    }),

  refreshToken: () =>
    http.post<SuccessResponse<AuthClientResType>>(
      "/api/auth/refresh-token",
      null,
      { baseUrl: "" },
    ),

  logout: () =>
    http.post<SuccessResponse<null>>("/api/auth/logout", null, { baseUrl: "" }),
};

export default authApiRequest;
