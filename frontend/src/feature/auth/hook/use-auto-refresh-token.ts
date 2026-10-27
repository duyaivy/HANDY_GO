"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { HttpError, refreshAuthSession } from "@/shared/api/http";
import type { AuthClientResType, AuthUserType } from "../schemas/auth.schema";

export type AuthStatus =
  | "checking"
  | "authenticated"
  | "forbidden"
  | "error";

export function useAutoRefreshToken() {
  const router = useRouter();
  const [status, setStatus] = useState<AuthStatus>("checking");
  const [user, setUser] = useState<AuthUserType | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const validateSession = async (background = false) => {
      try {
        const response = await refreshAuthSession();
        let payload: { data?: AuthClientResType; message?: string };

        try {
          payload = await response.clone().json();
        } catch {
          throw new Error("Phản hồi xác thực phiên không hợp lệ");
        }

        if (cancelled) return;

        if (!response.ok) {
          throw new HttpError({
            status: response.status,
            payload: { message: payload.message },
          });
        }

        const data = payload.data;
        if (
          !data ||
          !Number.isFinite(data.expiresIn) ||
          data.expiresIn <= 0
        ) {
          throw new Error("Backend trả về thông tin phiên không hợp lệ");
        }

        const roles = data.user?.roles;
        if (Array.isArray(roles)) {
          const canManage = roles.some(
            (role) =>
              typeof role === "string" &&
              ["manager", "admin"].includes(
                role.trim().toLowerCase().replace(/^role[_-]?/, ""),
              ),
          );
          if (!canManage) {
            setUser(data.user);
            setStatus("forbidden");
            toast.error("Bạn không có quyền truy cập trang quản lý");
            return;
          }
        }

        setUser(data.user);
        setStatus("authenticated");
        const delay = Math.max((data.expiresIn - 60) * 1000, 10_000);
        timeoutId = setTimeout(() => {
          void validateSession(true);
        }, delay);
      } catch (error) {
        if (cancelled) return;

        if (error instanceof HttpError && error.status === 401) {
          try {
            await fetch("/api/auth/logout", { method: "POST" });
          } catch (logoutError) {
            console.error("Không thể xóa phiên đăng nhập", logoutError);
          }
          if (!cancelled) router.replace("/login");
          return;
        }

        console.error("Không thể xác thực phiên", error);
        if (background) {
          timeoutId = setTimeout(() => {
            void validateSession(true);
          }, 30_000);
        } else {
          setStatus("error");
        }
      }
    };

    void validateSession();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [retryCount, router]);

  const retry = () => {
    setStatus("checking");
    setRetryCount((count) => count + 1);
  };

  return { status, user, retry };
}
