"use client";

import { useRef, useState, type FormEvent } from "react";
import { AlertCircle, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { useCreateRefund } from "../hooks/use-refunds";
import { getRefundErrorMessage } from "../refund-utils";

type CreateRefundDialogProps = {
  paymentId: string;
  disabled: boolean;
  onCreated?: () => void;
};

function createIdempotencyKey() {
  return crypto.randomUUID();
}

export default function CreateRefundDialog({
  paymentId,
  disabled,
  onCreated,
}: CreateRefundDialogProps) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState("");

  const idempotencyKey = useRef<string>("");
  const mutation = useCreateRefund();

  const isPending = mutation.isPending;

  // ===================== ERROR =====================

  function clearError() {
    setFormError("");

    if (mutation.isError) {
      mutation.reset();
    }
  }

  // ===================== SUBMIT =====================

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (disabled || isPending) return;

    const normalizedAmount = amount.trim();
    const normalizedReason = reason.trim();

    setFormError("");
    mutation.reset();

    // Số tiền nguyên dương, tối đa 19 chữ số.
    if (!/^[1-9]\d{0,18}$/.test(normalizedAmount)) {
      setFormError("Nhập số tiền hoàn là số VND nguyên lớn hơn 0.");
      return;
    }

    // Lý do tối đa 1000 ký tự.
    if (!normalizedReason || normalizedReason.length > 1000) {
      setFormError("Nhập lý do hoàn tiền từ 1 đến 1.000 ký tự.");
      return;
    }

    // Giữ nguyên key khi retry cùng một yêu cầu.
    if (!idempotencyKey.current) {
      idempotencyKey.current = createIdempotencyKey();
    }

    mutation.mutate(
      {
        paymentId,
        input: {
          amount: normalizedAmount,
          reason: normalizedReason,
          idempotencyKey: idempotencyKey.current,
        },
      },
      {
        onSuccess: () => {
          toast.success("Đã tạo yêu cầu hoàn tiền");

          setAmount("");
          setReason("");
          setFormError("");

          idempotencyKey.current = "";

          // Thông báo cho modal cha đóng và cập nhật bảng.
          onCreated?.();
        },
      },
    );
  }

  const error =
    formError ||
    (mutation.error
      ? getRefundErrorMessage(
          mutation.error,
          "Không thể tạo yêu cầu hoàn tiền.",
        )
      : "");

  // ===================== RENDER =====================

  return (
    <form
      onSubmit={submit}
      className="space-y-4 border-t border-slate-100 pt-5"
    >
      {/* HEADER */}

      <div className="space-y-1">
        <h3 className="text-[14px] font-semibold text-[#0F172A]">
          Thông tin yêu cầu hoàn tiền
        </h3>

        <p className="text-[12px] leading-5 text-[#64748B]">
          Nhập số tiền và lý do hoàn tiền cho giao dịch đã chọn. Yêu cầu mới sẽ
          ở trạng thái chờ duyệt.
        </p>
      </div>

      {/* ===================== AMOUNT ===================== */}

      <div className="space-y-2">
        <label
          htmlFor="refund-amount"
          className="block text-[13px] font-medium text-[#0F172A]"
        >
          Số tiền hoàn
          <span className="ml-1 text-red-500">*</span>
        </label>

        <div className="relative">
          <Input
            id="refund-amount"
            name="amount"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            required
            maxLength={19}
            value={amount}
            disabled={disabled || isPending}
            onChange={(event) => {
              setAmount(event.target.value);
              idempotencyKey.current = "";
              clearError();
            }}
            placeholder="Ví dụ: 50000"
            className="h-11 rounded-xl border-slate-200 pr-14 text-[13px] focus-visible:border-[#FF5E14] focus-visible:ring-[#FF5E14]/20"
          />

          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-medium text-slate-500">
            VND
          </span>
        </div>

        <p className="text-[12px] text-[#64748B]">
          Nhập số tiền nguyên, không dùng dấu chấm hoặc dấu phẩy.
        </p>
      </div>

      {/* ===================== REASON ===================== */}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            htmlFor="refund-reason"
            className="text-[13px] font-medium text-[#0F172A]"
          >
            Lý do hoàn tiền
            <span className="ml-1 text-red-500">*</span>
          </label>

          <span className="text-[11px] text-slate-400">
            {reason.length}/1000
          </span>
        </div>

        <Textarea
          id="refund-reason"
          name="reason"
          required
          rows={4}
          maxLength={1000}
          value={reason}
          disabled={disabled || isPending}
          onChange={(event) => {
            setReason(event.target.value);
            idempotencyKey.current = "";
            clearError();
          }}
          placeholder="Nhập lý do yêu cầu hoàn tiền..."
          className="min-h-[110px] resize-y rounded-xl border-slate-200 text-[13px] leading-6 focus-visible:border-[#FF5E14] focus-visible:ring-[#FF5E14]/20"
        />
      </div>

      {/* ===================== ERROR ===================== */}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-3 text-[12px] leading-5 text-red-700"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" />

          <p>{error}</p>
        </div>
      )}

      {/* ===================== SUBMIT ===================== */}

      <div className="flex justify-end border-t border-slate-100 pt-4">
        <Button
          type="submit"
          disabled={disabled || isPending}
          className="h-10 rounded-lg bg-[#FF5E14] px-5 text-[13px] font-medium text-white hover:bg-[#E65310] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? (
            <>
              <Loader2
                size={16}
                className="animate-spin"
                data-icon="inline-start"
              />
              Đang tạo...
            </>
          ) : (
            <>
              <Plus size={16} data-icon="inline-start" />
              Xác nhận tạo yêu cầu
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
