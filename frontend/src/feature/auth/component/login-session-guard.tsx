"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import LoginForm from "./LoginForm";
import {
  clearAuthSessionCookies,
  getAuthCookieState,
  refreshAuthSession,
} from "@/shared/api/http";

type LoginGuardStatus = "checking" | "login" | "forbidden" | "error";

export default function LoginSessionGuard() {
  const router = useRouter();
  const [status, setStatus] = useState<LoginGuardStatus>("checking");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const checkSession = async () => {
      try {
        const cookies = await getAuthCookieState();
        if (cancelled) return;

        if (!cookies.hasAccessToken && !cookies.hasRefreshToken) {
          setStatus("login");
          return;
        }

        const response = await refreshAuthSession();
        if (cancelled) return;

        if (response.ok) {
          router.replace("/manager/dashboard");
          router.refresh();
          return;
        }

        if (response.status === 401) {
          await clearAuthSessionCookies();
          if (!cancelled) setStatus("login");
          return;
        }

        if (response.status === 403) {
          setStatus("forbidden");
          return;
        }

        throw new Error(`Lỗi kiểm tra phiên (${response.status})`);
      } catch (error) {
        if (cancelled) return;
        console.error("Không thể kiểm tra phiên đăng nhập", error);
        setStatus("error");
      }
    };

    void checkSession();

    return () => {
      cancelled = true;
    };
  }, [retryCount, router]);

  if (status === "login") return <LoginForm />;

  if (status === "forbidden") {
    return (
      <main className="flex min-h-screen items-center justify-center p-6 text-center">
        <p className="text-sm font-medium text-slate-700">
          Tài khoản hiện tại không có quyền truy cập trang quản lý.
        </p>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-sm font-medium text-slate-700">
          Không thể kiểm tra phiên đăng nhập. Vui lòng thử lại.
        </p>
        <button
          type="button"
          onClick={() => {
            setStatus("checking");
            setRetryCount((count) => count + 1);
          }}
          className="rounded-lg bg-[#FF5E14] px-4 py-2 text-sm font-semibold text-white"
        >
          Thử lại
        </button>
      </main>
    );
  }

  return null;
}
