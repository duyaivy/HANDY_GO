"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import LoginForm from "./LoginForm";
import { refreshAuthSession } from "@/shared/api/http";

export default function LoginSessionGuard() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const checkSession = async () => {
      try {
        const response = await refreshAuthSession();

        if (cancelled) return;

        if (response.ok) {
          router.replace("/manager/dashboard");
          router.refresh();
          return;
        }

        if (response.status === 401) {
          try {
            await fetch("/api/auth/logout", { method: "POST" });
          } catch (error) {
            console.error("Không thể xóa phiên đăng nhập hết hạn", error);
          }
        }
      } catch (error) {
        console.error("Không thể kiểm tra phiên đăng nhập", error);
      }

      if (!cancelled) setChecked(true);
    };

    void checkSession();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!checked) return null;

  return <LoginForm />;
}
