"use client";

import { createContext, useContext } from "react";
import { useAutoRefreshToken } from "../hook/use-auto-refresh-token";
import type { AuthUserType } from "../schemas/auth.schema";

const AuthUserContext = createContext<AuthUserType | null>(null);

export function useAuthUser(): AuthUserType {
  const user = useContext(AuthUserContext);
  if (!user) {
    throw new Error("useAuthUser chỉ được sử dụng trong phiên đã xác thực.");
  }
  return user;
}

export default function AuthSession({
  children,
}: {
  children: (user: AuthUserType) => React.ReactNode;
}) {
  const { status, user, retry } = useAutoRefreshToken();

  if (status === "authenticated" && user) {
    return (
      <AuthUserContext.Provider value={user}>
        {children(user)}
      </AuthUserContext.Provider>
    );
  }

  if (status === "forbidden") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F8FAFC] p-6 text-center">
        <p className="text-sm font-medium text-slate-700">
          Bạn không có quyền truy cập trang quản lý.
        </p>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#F8FAFC] p-6 text-center">
        <p className="text-sm font-medium text-slate-700">
          Không thể xác thực phiên đăng nhập. Vui lòng thử lại.
        </p>
        <button
          type="button"
          onClick={retry}
          className="rounded-lg bg-[#FF5E14] px-4 py-2 text-sm font-semibold text-white"
        >
          Thử lại
        </button>
      </main>
    );
  }

  return null;
}