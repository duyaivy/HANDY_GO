import type { ReactNode } from "react";
import PaymentTabs from "@/feature/payments/components/payment-tabs";

export default function PaymentLayout({ children }: { children: ReactNode }) {
  return (
    <div className="w-full min-w-0 space-y-4 font-['Inter',sans-serif] leading-[1.6] text-slate-900 antialiased">
      <h1 className="text-xl font-semibold tracking-tight sm:text-[24px]">
        Quản lý thanh toán
      </h1>
      <PaymentTabs />
      {children}
    </div>
  );
}
