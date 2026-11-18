"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { ROUTES } from "@/shared/constants/route";

const PAYMENT_ROUTES = ROUTES.manageR.PAYMENTS;
const PAYMENT_TABS = [
  { label: "Giao dịch", href: PAYMENT_ROUTES.TRANSACTIONS, segment: "transactions" },
  { label: "Hoàn tiền", href: PAYMENT_ROUTES.REFUNDS, segment: "refunds" },
  { label: "Hoa hồng", href: PAYMENT_ROUTES.FEES, segment: "fees" },
  { label: "Vận hành", href: PAYMENT_ROUTES.OPERATIONS, segment: "operations" },
] as const;

export default function PaymentTabs() {
  const segment = useSelectedLayoutSegment();

  return (
    <nav aria-label="Chức năng thanh toán" className="overflow-x-auto border-b border-slate-200 pb-4">
      <ul className="flex w-max min-w-full gap-2">
        {PAYMENT_TABS.map((tab) => {
          const isActive = tab.segment === segment;

          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={`inline-flex h-9 items-center justify-center whitespace-nowrap rounded-full border px-4 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-slate-900 ${
                  isActive
                    ? "border-[#FF5E14] bg-[#FF5E14] font-semibold text-white"
                    : "border-slate-300 bg-transparent font-medium text-slate-600 hover:border-orange-300 hover:bg-orange-50 hover:text-[#C2410C]"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
