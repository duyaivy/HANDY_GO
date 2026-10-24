"use client";

import { useAutoRefreshToken } from "../hook/use-auto-refresh-token";



export default function AuthSession() {
  useAutoRefreshToken();

  return null;
}