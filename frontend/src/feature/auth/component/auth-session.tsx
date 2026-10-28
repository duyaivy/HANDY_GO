"use client";

import { useAutoRefreshToken } from "../hook/use-auto-refresh-token";
import type { AuthUserType } from "../schemas/auth.schema";

export default function AuthSession({
  children,
}: {
  children: (user: AuthUserType) => React.ReactNode;
}) {
  const { status, user, retry } = useAutoRefreshToken();

  if (status === "authenticated" && user) return children(user);

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