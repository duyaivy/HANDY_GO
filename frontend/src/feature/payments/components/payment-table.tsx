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

const HEADERS = ["Giao dịch", "Số tiền", "Phương thức", "Trạng thái", "Ngày tạo", "Thao tác"];

export default function PaymentTable({
  payments,
  isLoading,
  onViewDetail,
}: PaymentTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-3 p-4 sm:p-5" role="status">
        <span className="sr-only">Đang tải danh sách giao dịch</span>
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (payments.length === 0) {
    return (
      <div role="status" className="flex flex-col items-center gap-3 px-6 py-12 text-center text-sm text-slate-500">
        <Inbox size={30} strokeWidth={1.5} className="text-slate-400" />
        Không tìm thấy giao dịch nào.
      </div>
    );
  }

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
            const amount = formatPaymentAmount(payment.amount, payment.currency);
            const method = payment.method ? PAYMENT_METHODS[payment.method] : "Chưa chọn";
            const createdAt = formatPaymentDate(payment.createdAt);

            return (
              <tr key={payment.id} className="hover:bg-slate-50/60">
                <td className="px-4 py-4 sm:px-5">
                  <p title={payment.id} className="truncate font-medium">{payment.id}</p>
                  <p title={payment.orderId} className="mt-1 truncate text-xs text-slate-500">
                    Đơn hàng {payment.orderId}
                  </p>
                  <div className="mt-2 space-y-1 md:hidden">
                    <p className="font-medium">{amount} <span className="font-normal text-slate-500">· {method}</span></p>
                    <p className="text-xs text-slate-500">{createdAt}</p>
                    <PaymentStatusBadge status={payment.status} />
                  </div>
                </td>
                <td className="hidden break-words px-3 py-4 font-medium md:table-cell">{amount}</td>
                <td className="hidden px-3 py-4 text-slate-600 md:table-cell">{method}</td>
                <td className="hidden px-3 py-4 md:table-cell"><PaymentStatusBadge status={payment.status} /></td>
                <td className="hidden px-3 py-4 text-slate-600 md:table-cell">{createdAt}</td>
                <td className="px-4 py-4 text-right align-middle sm:px-5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-slate-200 text-slate-700 hover:border-orange-200 hover:bg-orange-50 hover:text-[#FF5E14]"
                    aria-label={`Xem chi tiết giao dịch ${payment.id}`}
                    onClick={() => onViewDetail(payment.id)}
                  >
                    Chi tiết <ChevronRight data-icon="inline-end" />
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
