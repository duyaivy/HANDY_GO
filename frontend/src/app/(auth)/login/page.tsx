// src/app/(auth)/login/page.tsx

import LoginSessionGuard from "@/feature/auth/component/login-session-guard";

export default function LoginPage() {
  return <LoginSessionGuard />;
}
