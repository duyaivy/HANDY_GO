import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { STATUS_LABELS, STATUS_COLORS } from "@/lib/order-utils";
import type { DisputeAction, Order } from "../types";

const DISPUTE_OPTIONS: {
  value: DisputeAction;
  title: string;
  description: string;
}[] = [
  {
    value: "resume_previous_state",
    title: "Khôi phục trạng thái trước tranh chấp",
    description:
      "Đưa đơn hàng trở về trạng thái trước khi phát sinh tranh chấp.",
  },
  {
    value: "cancel",
    title: "Hủy đơn hàng",
    description: "Kết thúc đơn hàng bằng quyết định hủy.",
  },
  {
    value: "complete",
    title: "Hoàn thành đơn hàng",
    description: "Đánh dấu đơn hàng đã hoàn thành sau khi xem xét.",
  },
];

interface Props {
  disputeReason?: string | null;
  previousStatus?: Order["status"] | null;
  resolutionNote?: string | null;
  isDisputed: boolean;
  action: DisputeAction;
  onActionChange: (value: DisputeAction) => void;
  onResetConfirmation: () => void;
  actionForm: ReactNode;
}

export default function OrderDisputeTab({
  disputeReason,
  previousStatus,
  resolutionNote,
  isDisputed,
  action,
  onActionChange,
  onResetConfirmation,
  actionForm,
}: Props) {
  return (
    <div className="min-w-0 space-y-5 sm:space-y-6">
      {disputeReason ? (
        <div className="min-w-0 rounded-xl border border-rose-100 bg-rose-50/60 p-3.5 sm:p-4">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-rose-900">
            <AlertTriangle size={16} className="shrink-0" />
            Nội dung tranh chấp
          </div>

          <p className="mt-2 break-words text-[13px] leading-6 text-rose-900/90">
            {disputeReason}
          </p>

          {previousStatus && (
            <p className="mt-3 border-t border-rose-100 pt-3 text-xs leading-5 text-rose-700/80">
              Trạng thái trước tranh chấp:{" "}
              <span className="font-medium">
                {STATUS_LABELS[previousStatus]}
              </span>
            </p>
          )}
        </div>
      ) : (
        <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-[13px] text-slate-500">
          Đơn hàng không có tranh chấp đang chờ xử lý.
        </p>
      )}

      {isDisputed && (
        <fieldset className="min-w-0">
          <legend className="mb-3 text-[14px] font-semibold text-slate-900">
            Giải quyết tranh chấp
          </legend>

          <div className="space-y-2 sm:space-y-2.5">
            {DISPUTE_OPTIONS.map((option) => {
              const selected = action === option.value;

              return (
                <label
                  key={option.value}
                  className={`flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-[border-color,background-color,box-shadow] duration-150 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-orange-100 sm:p-4 ${
                    selected
                      ? "border-[#FF5E14] bg-orange-50/40"
                      : "border-slate-200 bg-white hover:border-orange-200"
                  }`}
                >
                  <input
                    type="radio"
                    name="dispute-action"
                    value={option.value}
                    checked={selected}
                    onChange={() => {
                      onActionChange(option.value);
                      onResetConfirmation();
                    }}
                    className="mt-1 shrink-0 accent-[#FF5E14]"
                  />

                  <div className="min-w-0 flex-1">
                    <p className="break-words text-[13px] font-medium text-slate-900">
                      {option.title}
                    </p>

                    <p className="mt-0.5 break-words text-xs leading-5 text-slate-500">
                      {option.description}
                    </p>

                    {option.value === "resume_previous_state" && selected && (
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        <span className="text-[12px] text-slate-500">
                          Trạng thái khôi phục:
                        </span>

                        {previousStatus ? (
                          <span
                            className={`inline-flex max-w-full items-center rounded-full px-2.5 py-1 text-[12px] font-medium ${
                              STATUS_COLORS[previousStatus]
                            }`}
                          >
                            {STATUS_LABELS[previousStatus]}
                          </span>
                        ) : (
                          <span className="text-[12px] text-amber-600">
                            Không xác định được trạng thái trước tranh chấp.
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </label>
              );
            })}
          </div>

          {actionForm}
        </fieldset>
      )}

      {resolutionNote && (
        <div className="min-w-0 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3.5 sm:p-4">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-emerald-900">
            <CheckCircle2 size={16} className="shrink-0" />
            Ghi chú xử lý của Admin
          </p>

          <p className="mt-2 break-words text-[13px] leading-6 text-emerald-800">
            {resolutionNote}
          </p>
        </div>
      )}
    </div>
  );
}
