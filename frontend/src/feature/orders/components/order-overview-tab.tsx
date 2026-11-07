import type { ReactNode } from "react";
import { MapPin } from "lucide-react";

import { formatCurrency, PAYMENT_LABELS } from "@/lib/order-utils";
import type { Order, OrderDetail } from "../types";

function formatDateTime(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

interface Props {
  order: Order;
  detail: OrderDetail | null;
  paymentState: Order["paymentState"];
}

export default function OrderOverviewTab({
  order,
  detail,
  paymentState,
}: Props) {
  const field = (label: string, value: ReactNode, full = false) => (
    <div
      className={`min-w-0 border-t border-slate-100 pt-3.5 sm:pt-4 ${
        full ? "sm:col-span-2" : ""
      }`}
    >
      <dt className="text-[12px] text-slate-500">{label}</dt>
      <dd className="mt-1 min-w-0 break-words text-[12.5px] font-medium leading-5 text-slate-900 sm:text-[13px]">
        {value}
      </dd>
    </div>
  );

  const mono = (value?: string | null) => (
    <span className="break-all font-mono text-[12px] font-normal text-slate-600 sm:text-[12.5px]">
      {value || "Chưa cập nhật"}
    </span>
  );

  return (
    <div className="min-w-0">
      <div>
        <p className="text-[12px] text-slate-500">Giá trị đơn hàng</p>

        <p className="mt-1 break-words text-[clamp(1.5rem,6vw,1.875rem)] font-semibold leading-tight tracking-tight tabular-nums text-slate-900">
          {formatCurrency(detail ? Number(detail.agreedPrice) : order.price)}
        </p>
      </div>

      <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-4 sm:mt-7 sm:grid-cols-2 sm:gap-x-8 sm:gap-y-5">
        {field("Khách hàng", mono(order.customer))}
        {field("Thợ thực hiện", mono(order.worker))}
        {field("Thanh toán", PAYMENT_LABELS[paymentState])}
        {field("Ngày tạo", formatDateTime(order.createdAt))}

        {field(
          "Địa chỉ thực hiện",
          <span className="flex min-w-0 items-start gap-2">
            <MapPin size={15} className="mt-0.5 shrink-0 text-slate-400" />
            <span className="min-w-0 break-words">
              {order.address || "Chưa cập nhật"}
            </span>
          </span>,
          true,
        )}

        {field("Nội dung công việc", order.service || "Chưa cập nhật", true)}

        {field("Mã định danh đơn hàng", mono(order.id), true)}
      </dl>
    </div>
  );
}
