
"use client";

import { useEffect } from "react";
import authApiRequest from "../api/auth.api";

let refreshPromise: ReturnType<
  typeof authApiRequest.refreshToken
> | null = null;

function refreshOnce() {
  if (!refreshPromise) {
    refreshPromise = authApiRequest
      .refreshToken()
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

export function useAutoRefreshToken() {
  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const scheduleRefresh = (expiresIn: number) => {
      if (cancelled) return;

      // Refresh trước khi hết hạn 60 giây
      const delay = Math.max(
        (expiresIn - 60) * 1000,
        10_000
      );

      timeoutId = setTimeout(async () => {
        try {
          const response = await refreshOnce();

          if (!cancelled) {
            scheduleRefresh(
              response.payload.data.expiresIn
            );
          }
        } catch (error) {
          console.error("Refresh token thất bại", error);
        }
      }, delay);
    };

    // Khi component mount, refresh một lần
    // để lấy expiresIn mới nhất từ server
    refreshOnce()
      .then((response) => {
        scheduleRefresh(
          response.payload.data.expiresIn
        );
      })
      .catch((error) => {
        console.error("Không thể khôi phục phiên", error);
      });

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, []);
}
