import { ChevronRight, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import {
  formatPaymentAmount,
  formatPaymentDate,
  PAYMENT_METHODS,
} from "../payment-utils";

import type { PaymentRecord } from "../types";
import PaymentStatusBadge from "./payment-status-badge";

type PaymentTableProps = {
  payments: PaymentRecord[];
  isLoading: boolean;
  onViewDetail: (id: string) => void;
};

const HEADERS = [
  "Giao dịch",
  "Số tiền",
  "Phương thức",
  "Trạng thái",
  "Ngày tạo",
  "Thao tác",
];

// Skeleton cho từng hàng giao dịch
const SkeletonRow = () => (
  <tr>
    {/* Giao dịch */}
    <td className="px-4 py-4 sm:px-5">
      <div className="space-y-2">
        <Skeleton className="h-4 w-36 max-w-full" />
        <Skeleton className="h-3 w-48 max-w-full" />

        {/* Thông tin hiển thị trên mobile */}
        <div className="mt-3 space-y-2 md:hidden">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      </div>
    </td>

    {/* Số tiền */}
    <td className="hidden px-3 py-4 md:table-cell">
      <Skeleton className="h-4 w-24 max-w-full" />
    </td>

    {/* Phương thức */}
    <td className="hidden px-3 py-4 md:table-cell">
      <Skeleton className="h-4 w-20 max-w-full" />
    </td>

    {/* Trạng thái */}
    <td className="hidden px-3 py-4 md:table-cell">
      <Skeleton className="h-6 w-24 max-w-full rounded-full" />
    </td>

    {/* Ngày tạo */}
    <td className="hidden px-3 py-4 md:table-cell">
      <Skeleton className="h-4 w-28 max-w-full" />
    </td>

    {/* Thao tác */}
    <td className="px-4 py-4 text-right align-middle sm:px-5">
      <div className="flex justify-end">
        <Skeleton className="h-8 w-24 max-w-full rounded-lg" />
      </div>
    </td>
  </tr>
);

export default function PaymentTable({
  payments,
  isLoading,
  onViewDetail,
}: PaymentTableProps) {
  // Loading Skeleton
  if (isLoading) {
    return (
      <div
        className="overflow-x-auto overscroll-x-contain"
        role="status"
        aria-busy="true"
      >
        <span className="sr-only">Đang tải danh sách giao dịch</span>

        <table className="w-full table-fixed border-collapse text-left">
          <thead className="border-b border-slate-100 bg-slate-50/70 text-xs text-slate-900">
            <tr>
              {HEADERS.map((label, index) => (
                <th
                  key={label}
                  scope="col"
                  className={
                    index === 0
                      ? "px-4 py-3.5 sm:px-5 md:w-[25%]"
                      : index === HEADERS.length - 1
                        ? "w-24 px-4 py-3.5 text-right sm:w-28 sm:px-5"
                        : "hidden px-3 py-3.5 md:table-cell"
                  }
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {Array.from({ length: 5 }, (_, index) => (
              <SkeletonRow key={index} />
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Không có dữ liệu
  if (payments.length === 0) {
    return (
      <div
        role="status"
        className="flex flex-col items-center gap-3 px-6 py-12 text-center text-sm text-slate-500"
      >
        <Inbox size={30} strokeWidth={1.5} className="text-slate-400" />
        Không tìm thấy giao dịch nào.
      </div>
    );
  }

  // Bảng dữ liệu giao dịch
  return (
    <div className="overflow-x-auto overscroll-x-contain">
      <table className="w-full table-fixed border-collapse text-left">
        <thead className="border-b border-slate-100 bg-slate-50/70 text-xs text-slate-900">
          <tr>
            {HEADERS.map((label, index) => (
              <th
                key={label}
                scope="col"
                className={
                  index === 0
                    ? "px-4 py-3.5 sm:px-5 md:w-[25%]"
                    : index === HEADERS.length - 1
                      ? "w-24 px-4 py-3.5 text-right sm:w-28 sm:px-5"
                      : "hidden px-3 py-3.5 md:table-cell"
                }
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-100 text-[13px]">
          {payments.map((payment) => {
            const amount = formatPaymentAmount(
              payment.amount,
              payment.currency,
            );

            const method = payment.method
              ? PAYMENT_METHODS[payment.method]
              : "Chưa chọn";

            const createdAt = formatPaymentDate(payment.createdAt);

            return (
              <tr key={payment.id} className="hover:bg-slate-50/60">
                {/* Giao dịch */}
                <td className="px-4 py-4 sm:px-5">
                  <p title={payment.id} className="truncate font-medium">
                    {payment.id}
                  </p>

                  <p
                    title={payment.orderId}
                    className="mt-1 truncate text-xs text-slate-500"
                  >
                    Đơn hàng {payment.orderId}
                  </p>

                  {/* Thông tin mobile */}
                  <div className="mt-2 space-y-1 md:hidden">
                    <p className="font-medium">
                      {amount}{" "}
                      <span className="font-normal text-slate-500">
                        · {method}
                      </span>
                    </p>

                    <p className="text-xs text-slate-500">{createdAt}</p>

                    <PaymentStatusBadge status={payment.status} />
                  </div>
                </td>

                {/* Số tiền */}
                <td className="hidden break-words px-3 py-4 font-medium md:table-cell">
                  {amount}
                </td>

                {/* Phương thức */}
                <td className="hidden px-3 py-4 text-slate-600 md:table-cell">
                  {method}
                </td>

                {/* Trạng thái */}
                <td className="hidden px-3 py-4 md:table-cell">
                  <PaymentStatusBadge status={payment.status} />
                </td>

                {/* Ngày tạo */}
                <td className="hidden px-3 py-4 text-slate-600 md:table-cell">
                  {createdAt}
                </td>

                {/* Thao tác */}
                <td className="px-4 py-4 text-right align-middle sm:px-5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-slate-200 text-slate-700 hover:border-orange-200 hover:bg-orange-50 hover:text-[#FF5E14]"
                    aria-label={`Xem chi tiết giao dịch ${payment.id}`}
                    onClick={() => onViewDetail(payment.id)}
                  >
                    Chi tiết
                    <ChevronRight data-icon="inline-end" />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
