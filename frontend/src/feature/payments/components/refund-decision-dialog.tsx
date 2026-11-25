"use client";

import { useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { HttpError } from "@/shared/api/http";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

import type { Refund } from "../types/refund";
import { useRefundDecision } from "../hooks/use-refunds";
import { formatPaymentAmount } from "../payment-utils";

type RefundDecision = {
  refund: Refund;
  approve: boolean;
};

type RefundDecisionDialogProps = {
  decision: RefundDecision | null;
  onClose: () => void;
};

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5E14]";

function isOwnRefundError(status: number, message: string) {
  if (status !== 403) return false;

  const normalized = message.toLowerCase();

  return (
    normalized.includes("cannot decide their own refund") ||
    normalized.includes("own refund")
  );
}

export default function RefundDecisionDialog({
  decision,
  onClose,
}: RefundDecisionDialogProps) {
  const mutation = useRefundDecision();

  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isOpen = Boolean(decision);
  const isApprove = decision?.approve ?? false;
  const refund = decision?.refund;

  function handleClose() {
    if (isSubmitting) return;

    setReason("");
    setFormError("");
    onClose();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!decision || isSubmitting) return;

    const normalizedReason = reason.trim();

    setFormError("");

    if (!normalizedReason) {
      setFormError("Vui lòng nhập lý do xử lý hoàn tiền.");
      return;
    }

    if (normalizedReason.length > 1000) {
      setFormError("Lý do không được vượt quá 1.000 ký tự.");
      return;
    }

    setIsSubmitting(true);

    try {
      await mutation.mutateAsync({
        refundId: decision.refund.id,
        input: {
          approve: decision.approve,
          reason: normalizedReason,
        },
      });

      // useRefundDecision đã invalidate query danh sách refund.
      toast.success(
        decision.approve
          ? "Đã duyệt yêu cầu hoàn tiền"
          : "Đã từ chối yêu cầu hoàn tiền",
        {
          description: decision.approve
            ? "Yêu cầu đã được phê duyệt và chuyển sang bước xử lý hoàn tiền."
            : "Yêu cầu hoàn tiền đã được từ chối.",
        },
      );

      setReason("");
      setFormError("");
      onClose();
    } catch (error) {
      if (error instanceof HttpError) {
        const message = error.payload.message ?? "";

        if (isOwnRefundError(error.status, message)) {
          toast.error("Không thể xử lý yêu cầu", {
            description:
              "Bạn không thể tự duyệt hoặc từ chối yêu cầu hoàn tiền do chính mình tạo. Vui lòng để Admin khác xử lý.",
            duration: 5000,
          });
        } else if (error.status === 403) {
          toast.error("Bạn không có quyền thực hiện", {
            description:
              "Tài khoản hiện tại không được phép xử lý yêu cầu hoàn tiền này.",
            duration: 5000,
          });
        } else if (error.status === 404) {
          toast.error("Không tìm thấy yêu cầu", {
            description:
              "Yêu cầu hoàn tiền không tồn tại hoặc không còn khả dụng.",
          });
        } else if (error.status === 409) {
          toast.error("Không thể xử lý yêu cầu", {
            description:
              "Yêu cầu có thể đã được xử lý trước đó. Vui lòng tải lại danh sách.",
          });
        } else if (error.status === 401) {
          toast.error("Phiên đăng nhập không hợp lệ", {
            description: "Vui lòng đăng nhập lại để tiếp tục.",
          });
        } else {
          toast.error("Xử lý hoàn tiền thất bại", {
            description: message || "Đã xảy ra lỗi. Vui lòng thử lại sau.",
          });
        }
      } else {
        console.error("[refund/decision]", error);
        toast.error("Không thể kết nối đến máy chủ", {
          description: "Vui lòng kiểm tra kết nối mạng và thử lại.",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogContent
        showCloseButton={!isSubmitting}
        className="
          w-[calc(100%-2rem)]
          max-w-[480px]
          gap-0 overflow-hidden
          rounded-2xl border border-slate-200
          bg-white p-0
          font-['Inter',sans-serif]
        "
      >
        <DialogHeader className="border-b border-slate-100 px-5 py-5 sm:px-6">
          <div className="flex items-start gap-3">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                isApprove
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-red-50 text-red-600"
              }`}
            >
              {isApprove ? <CheckCircle2 size={22} /> : <XCircle size={22} />}
            </div>

            <div className="min-w-0 flex-1 pr-4">
              <DialogTitle className="text-[17px] font-semibold text-slate-900">
                {isApprove
                  ? "Duyệt yêu cầu hoàn tiền"
                  : "Từ chối yêu cầu hoàn tiền"}
              </DialogTitle>

              <DialogDescription className="mt-1 text-[13px] leading-5 text-slate-500">
                {isApprove
                  ? "Xác nhận phê duyệt yêu cầu hoàn tiền này."
                  : "Xác nhận từ chối yêu cầu hoàn tiền này."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-5 px-5 py-5 sm:px-6">
            {refund && (
              <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[12px] text-slate-500">
                    Số tiền hoàn
                  </span>

                  <span className="text-[17px] font-semibold text-slate-900">
                    {formatPaymentAmount(refund.amount, "VND")}
                  </span>
                </div>

                <div className="h-px bg-slate-200/70" />

                <div className="space-y-1">
                  <p className="text-[12px] text-slate-500">Mã yêu cầu</p>

                  <p className="break-all font-mono text-[12px] text-slate-700">
                    {refund.id}
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-[12px] text-slate-500">
                    Lý do yêu cầu hoàn tiền
                  </p>

                  <p className="break-words text-[13px] leading-5 text-slate-700">
                    {refund.reason || "Không có lý do"}
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label
                htmlFor="refund-decision-reason"
                className="text-[13px] font-semibold text-slate-700"
              >
                {isApprove ? "Ghi chú phê duyệt" : "Lý do từ chối"}
                <span className="ml-1 text-red-500">*</span>
              </label>

              <Textarea
                id="refund-decision-reason"
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  if (formError) setFormError("");
                }}
                placeholder={
                  isApprove
                    ? "Nhập ghi chú phê duyệt..."
                    : "Nhập lý do từ chối yêu cầu..."
                }
                maxLength={1000}
                rows={4}
                disabled={isSubmitting}
                className={`
                  min-h-[110px] resize-none
                  rounded-xl border-slate-200
                  text-[13px]
                  focus-visible:border-[#FF5E14]
                  focus-visible:ring-orange-100
                  ${FOCUS_RING}
                `}
              />

              <div className="flex items-center justify-between gap-3">
                <span className="text-[12px] text-slate-500">
                  Tối đa 1.000 ký tự
                </span>

                <span className="text-[12px] text-slate-400">
                  {reason.length}/1000
                </span>
              </div>

              {formError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 text-[12px] text-red-600"
                >
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}
            </div>

            <div className="flex items-start gap-2.5 rounded-xl border border-orange-100 bg-orange-50/60 p-3">
              <AlertCircle
                size={17}
                className="mt-0.5 shrink-0 text-[#FF5E14]"
              />

              <p className="text-[12px] leading-5 text-amber-800">
                {isApprove
                  ? "Sau khi phê duyệt, hệ thống sẽ tiếp tục xử lý hoàn tiền theo quy trình."
                  : "Sau khi xác nhận, yêu cầu hoàn tiền sẽ bị từ chối."}
              </p>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/50 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={handleClose}
              className="h-10 rounded-lg border-slate-200 px-5 text-[13px]"
            >
              Hủy
            </Button>

            <Button
              type="submit"
              disabled={isSubmitting || !reason.trim()}
              className={`h-10 rounded-lg px-5 text-[13px] font-semibold text-white ${
                isApprove
                  ? "bg-[#FF5E14] hover:bg-[#E65310]"
                  : "bg-red-600 hover:bg-red-700"
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  Đang xử lý...
                </>
              ) : isApprove ? (
                "Xác nhận duyệt"
              ) : (
                "Xác nhận từ chối"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
