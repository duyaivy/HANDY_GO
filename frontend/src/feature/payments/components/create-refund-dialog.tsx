"use client";

import { useRef, useState, type FormEvent } from "react";
import { AlertCircle, Info, Loader2, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuthUser } from "@/feature/auth/component/auth-session";

import { useCreateRefund } from "../hooks/use-refunds";
import { getRefundErrorMessage } from "../refund-utils";

type CreateRefundDialogProps = {
  paymentId: string;
  disabled: boolean;
  refundableAmount: string | null;
  capacityLoading: boolean;
  capacityError: string | null;
  onRetryCapacity?: () => void;
  onCreated?: () => void;
  onSubmittingChange?: (submitting: boolean) => void;
};

type PendingRefund = {
  userId: string;
  paymentId: string;
  amount: string;
  reason: string;
  idempotencyKey: string;
};

// Pending operation được scope theo tài khoản để tài khoản khác không đọc payload cũ.
function getStorageKey(userId: string) {
  return `handygo:refund-pending:${encodeURIComponent(userId)}:v1`;
}

function readPendingRefund(userId: string): PendingRefund | null {
  const raw = window.localStorage.getItem(getStorageKey(userId));
  if (!raw) return null;

  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Trạng thái hoàn tiền đã lưu không hợp lệ.");
  }

  const record = value as Record<string, unknown>;
  if (
    record.userId !== userId ||
    typeof record.paymentId !== "string" ||
    !record.paymentId ||
    typeof record.amount !== "string" ||
    !/^[1-9]\d{0,18}$/.test(record.amount) ||
    typeof record.reason !== "string" ||
    !record.reason ||
    record.reason.length > 1000 ||
    typeof record.idempotencyKey !== "string" ||
    !record.idempotencyKey
  ) {
    throw new Error("Trạng thái hoàn tiền đã lưu không hợp lệ.");
  }

  return {
    userId,
    paymentId: record.paymentId,
    amount: record.amount,
    reason: record.reason,
    idempotencyKey: record.idempotencyKey,
  };
}

type InitialRefundState = {
  pendingRefund: PendingRefund | null;
  amount: string;
  reason: string;
  storageError: string;
};

function getInitialRefundState(
  userId: string,
  paymentId: string,
): InitialRefundState {
  // Component chỉ được render sau khi Admin mở modal. Nếu có SSR,
  // không truy cập localStorage ở phía server.
  if (typeof window === "undefined") {
    return { pendingRefund: null, amount: "", reason: "", storageError: "" };
  }

  try {
    const saved = readPendingRefund(userId);
    return {
      pendingRefund: saved,
      amount: saved?.paymentId === paymentId ? saved.amount : "",
      reason: saved?.paymentId === paymentId ? saved.reason : "",
      storageError: "",
    };
  } catch {
    // Không xóa dữ liệu hỏng: có thể là operation chưa rõ kết quả.
    return {
      pendingRefund: null,
      amount: "",
      reason: "",
      storageError:
        "Không thể đọc yêu cầu hoàn tiền đang chờ. Hãy xác minh trước khi gửi yêu cầu mới.",
    };
  }
}

async function withRefundSubmitLock<T>(
  userId: string,
  paymentId: string,
  operation: () => Promise<T>,
) {
  const lockName = `handygo:refund:${encodeURIComponent(userId)}:${encodeURIComponent(paymentId)}`;
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(lockName, { mode: "exclusive" }, operation);
  }
  // Không chạy không khóa: hai tab có thể tạo hai idempotencyKey khác nhau.
  throw new Error(
    "Trình duyệt không hỗ trợ Web Locks; không thể gửi refund an toàn.",
  );
}

export default function CreateRefundDialog({
  paymentId,
  disabled,
  refundableAmount,
  capacityLoading,
  capacityError,
  onRetryCapacity,
  onCreated,
  onSubmittingChange,
}: CreateRefundDialogProps) {
  const user = useAuthUser();
  // Parent render <CreateRefundDialog key={payment.id} ... /> nên khi
  // paymentId thay đổi, React sẽ khởi tạo component lại với dữ liệu tương ứng.
  // Không cần useEffect + setState đồng bộ (react-hooks/set-state-in-effect).
  const [initial] = useState(() => getInitialRefundState(user.id, paymentId));
  const [amount, setAmount] = useState(initial.amount);
  const [reason, setReason] = useState(initial.reason);
  const [formError, setFormError] = useState("");
  const [pendingRefund, setPendingRefund] = useState<PendingRefund | null>(
    initial.pendingRefund,
  );
  const [storageError, setStorageError] = useState(initial.storageError);
  const submittingRef = useRef(false);
  const mutation = useCreateRefund();

  function clearError() {
    setFormError("");
    if (mutation.isError) mutation.reset();
  }

  const isPending = mutation.isPending;
  const pendingThisPayment = pendingRefund?.paymentId === paymentId;
  const pendingOtherPayment = Boolean(pendingRefund && !pendingThisPayment);
  // Retry của yêu cầu chưa rõ kết quả KHÔNG được chặn do hạn mức mới
  // có thể đã giảm vì chính yêu cầu cũ đã được Backend ghi nhận.
  const capacityUnavailable =
    !pendingThisPayment &&
    (capacityLoading ||
      Boolean(capacityError) ||
      refundableAmount === null ||
      refundableAmount === "0");
  // Payment không còn eligible chỉ chặn request MỚI.
  // Operation cũ vẫn phải có đường retry với đúng key đã lưu.
  const cannotCreateNewRefund = disabled && !pendingThisPayment;
  const isBlocked =
    cannotCreateNewRefund ||
    isPending ||
    Boolean(storageError) ||
    pendingOtherPayment ||
    capacityUnavailable;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isBlocked || submittingRef.current) return;

    const normalizedAmount = amount.trim();
    const normalizedReason = reason.trim();
    setFormError("");
    mutation.reset();

    if (!/^[1-9]\d{0,18}$/.test(normalizedAmount)) {
      setFormError(
        "Nhập số tiền hoàn là số VND nguyên lớn hơn 0, tối đa 19 chữ số.",
      );
      return;
    }
    if (!pendingThisPayment) {
      if (refundableAmount === null || capacityLoading || capacityError) {
        setFormError(
          "Chưa xác định được hạn mức hoàn tiền. Vui lòng tải lại trước khi tạo.",
        );
        return;
      }
      if (BigInt(normalizedAmount) > BigInt(refundableAmount)) {
        setFormError(
          `Số tiền vượt hạn mức còn có thể hoàn (${new Intl.NumberFormat("vi-VN").format(BigInt(refundableAmount))} VND).`,
        );
        return;
      }
    }

    if (!normalizedReason || normalizedReason.length > 1000) {
      setFormError("Nhập lý do hoàn tiền từ 1 đến 1.000 ký tự.");
      return;
    }

    try {
      await withRefundSubmitLock(user.id, paymentId, async () => {
        let operation: PendingRefund;
        try {
          // Đọc lại storage ngay lúc submit, không dựa vào state cũ của modal.
          const saved = readPendingRefund(user.id);
          if (saved) {
            setPendingRefund(saved);
            if (saved.paymentId !== paymentId) {
              setFormError(
                `Yêu cầu hoàn tiền của giao dịch ${saved.paymentId} chưa xác định kết quả. Hãy xác minh trước khi tạo yêu cầu khác.`,
              );
              return;
            }
            if (
              saved.amount !== normalizedAmount ||
              saved.reason !== normalizedReason
            ) {
              setAmount(saved.amount);
              setReason(saved.reason);
              setFormError(
                "Yêu cầu cũ chưa xác định kết quả. Không được thay đổi nội dung khi gửi lại.",
              );
              return;
            }
            operation = saved;
          } else {
            // Payment đã refunded không được tạo operation mới.
            if (disabled) {
              setFormError(
                "Giao dịch không còn đủ điều kiện tạo yêu cầu hoàn tiền mới.",
              );
              return;
            }
            // Nếu localStorage vừa được giải phóng, đây là request MỚI:
            // luôn kiểm tra hạn mức trước khi tạo key mới.
            if (
              refundableAmount === null ||
              capacityLoading ||
              capacityError ||
              BigInt(normalizedAmount) > BigInt(refundableAmount)
            ) {
              setFormError(
                "Hạn mức hoàn tiền không đủ hoặc chưa được xác định. Vui lòng kiểm tra lại.",
              );
              return;
            }
            operation = {
              userId: user.id,
              paymentId,
              amount: normalizedAmount,
              reason: normalizedReason,
              idempotencyKey: crypto.randomUUID(),
            };
            // Không gửi request nếu chưa lưu được key và payload.
            window.localStorage.setItem(
              getStorageKey(user.id),
              JSON.stringify(operation),
            );
            setPendingRefund(operation);
          }
        } catch {
          setStorageError(
            "Không thể lưu/đọc yêu cầu đang chờ. Đã dừng để tránh tạo hoàn tiền trùng.",
          );
          return;
        }

        submittingRef.current = true;
        onSubmittingChange?.(true);
        try {
          await mutation.mutateAsync({
            paymentId: operation.paymentId,
            input: {
              amount: operation.amount,
              reason: operation.reason,
              idempotencyKey: operation.idempotencyKey,
            },
          });

          // Chỉ coi là đã kết thúc sau khi nhận response thành công từ backend.
          try {
            const stored = readPendingRefund(user.id);
            if (stored?.idempotencyKey === operation.idempotencyKey) {
              window.localStorage.removeItem(getStorageKey(user.id));
            }
          } catch {
            setStorageError(
              "Backend đã xác nhận thành công, nhưng không thể xóa trạng thái đã lưu. Hãy kiểm tra danh sách refund trước khi thao tác tiếp.",
            );
            toast.warning(
              "Đã tạo refund, nhưng cần kiểm tra trạng thái đã lưu.",
            );
            return;
          }

          setPendingRefund(null);
          setAmount("");
          setReason("");
          setFormError("");
          toast.success("Đã tạo yêu cầu hoàn tiền");
          // Báo cho modal cha mở khóa trước khi yêu cầu đóng modal.
          submittingRef.current = false;
          onSubmittingChange?.(false);
          onCreated?.();
        } catch (caught) {
          const message = getRefundErrorMessage(
            caught instanceof Error
              ? caught
              : new Error("Không thể xác định kết quả."),
            "Không thể xác định kết quả tạo hoàn tiền.",
          );
          setFormError(
            `${message} Yêu cầu và mã chống trùng đã được giữ lại. Hãy kiểm tra danh sách hoàn tiền trước khi thử lại; chỉ gửi lại đúng yêu cầu cũ.`,
          );
          // Không xóa key khi timeout/502/lỗi không rõ kết quả.
        } finally {
          submittingRef.current = false;
          onSubmittingChange?.(false);
        }
      });
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Không thể khóa thao tác hoàn tiền. Vui lòng thử lại.",
      );
    }
  }

  const error =
    storageError ||
    formError ||
    (mutation.error
      ? getRefundErrorMessage(
          mutation.error,
          "Không thể tạo yêu cầu hoàn tiền.",
        )
      : "");

  return (
    <form
      onSubmit={submit}
      className="space-y-4 border-t border-slate-100 pt-5"
    >
      <div className="space-y-1">
        <h3 className="text-[14px] font-semibold text-[#0F172A]">
          Thông tin yêu cầu hoàn tiền
        </h3>
        <p className="text-[12px] leading-5 text-[#64748B]">
          Nhập số tiền và lý do hoàn tiền cho giao dịch đã chọn. Yêu cầu mới sẽ
          ở trạng thái chờ duyệt.
        </p>
      </div>

      {pendingRefund && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-[12px] leading-5 text-amber-900">
          <Info size={16} className="mt-0.5 shrink-0" />
          <p>
            {pendingThisPayment
              ? "Có yêu cầu trước đó chưa xác định kết quả. Nội dung đã được khôi phục và khóa để retry bằng mã chống trùng cũ. Hãy kiểm tra danh sách refund trước khi gửi lại."
              : `Đang có yêu cầu chưa xác định kết quả cho Payment ID ${pendingRefund.paymentId}. Hãy kiểm tra yêu cầu đó trước.`}
          </p>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-[12px] text-slate-500">Số tiền còn có thể hoàn</p>
        {capacityLoading && !pendingThisPayment ? (
          <p role="status" className="mt-1 text-[13px] text-slate-600">
            Đang tính hạn mức...
          </p>
        ) : capacityError ? (
          <div className="mt-1 space-y-2">
            <p role="alert" className="text-[12px] text-red-700">
              {capacityError}
            </p>
            <button
              type="button"
              onClick={onRetryCapacity}
              className="text-[12px] font-medium text-orange-600 underline"
            >
              Thử lại
            </button>
          </div>
        ) : refundableAmount !== null ? (
          <p className="mt-1 text-[18px] font-semibold text-slate-900">
            {new Intl.NumberFormat("vi-VN").format(BigInt(refundableAmount))}{" "}
            VND
          </p>
        ) : (
          <p className="mt-1 text-[12px] text-slate-600">
            Chưa xác định hạn mức.
          </p>
        )}
        {refundableAmount === "0" && !pendingThisPayment && (
          <p className="mt-1 text-[12px] text-amber-700">
            Giao dịch đã hết hạn mức hoàn tiền.
          </p>
        )}
        {pendingThisPayment && (
          <p className="mt-1 text-[12px] text-amber-700">
            Yêu cầu cũ có thể gửi lại bằng mã chống trùng đã lưu, ngay cả khi
            hạn mức hiện tại không còn.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label
          htmlFor="refund-amount"
          className="block text-[13px] font-medium text-[#0F172A]"
        >
          Số tiền hoàn<span className="ml-1 text-red-500">*</span>
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
            disabled={isBlocked || Boolean(pendingRefund)}
            onChange={(event) => {
              setAmount(event.target.value);
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
        {!pendingThisPayment &&
          refundableAmount !== null &&
          /^[1-9]\d{0,18}$/.test(amount.trim()) &&
          BigInt(amount.trim()) > BigInt(refundableAmount) && (
            <p role="alert" className="text-[12px] text-red-700">
              Số tiền vượt hạn mức còn có thể hoàn (
              {new Intl.NumberFormat("vi-VN").format(BigInt(refundableAmount))}{" "}
              VND).
            </p>
          )}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            htmlFor="refund-reason"
            className="text-[13px] font-medium text-[#0F172A]"
          >
            Lý do hoàn tiền<span className="ml-1 text-red-500">*</span>
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
          disabled={isBlocked || Boolean(pendingRefund)}
          onChange={(event) => {
            setReason(event.target.value);
            clearError();
          }}
          placeholder="Nhập lý do yêu cầu hoàn tiền..."
          className="min-h-[110px] resize-y rounded-xl border-slate-200 text-[13px] leading-6 focus-visible:border-[#FF5E14] focus-visible:ring-[#FF5E14]/20"
        />
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-3 text-[12px] leading-5 text-red-700"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <div className="flex justify-end border-t border-slate-100 pt-4">
        <Button
          type="submit"
          disabled={isBlocked}
          aria-busy={isPending}
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
          ) : pendingThisPayment ? (
            <>
              <RotateCcw size={16} data-icon="inline-start" />
              Gửi lại yêu cầu cũ
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
