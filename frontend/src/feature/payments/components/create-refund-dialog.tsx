"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { AlertCircle, Info, Loader2, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuthUser } from "@/feature/auth/component/auth-session";

import { useCreateRefund } from "../hooks/use-refunds";
import { classifyCreateRefundError } from "../refund-utils";

type VerifiedCapacity = {
  disabled: boolean;
  refundableAmount: string | null;
  capacitySnapshot: string | null;
};

type CreateRefundDialogProps = {
  paymentId: string;
  disabled: boolean;
  refundableAmount: string | null;
  capacitySnapshot?: string | null;
  capacityLoading: boolean;
  capacityError: string | null;
  onRetryCapacity?: () => void;
  onVerifyCapacity?: () => Promise<VerifiedCapacity>;
  onRefreshState?: () => void;
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

type RefundSyncMessage = {
  type: "refund-created" | "pending-updated" | "pending-cleared";
  senderTabId: string;
};

// Storage key và Web Lock dùng cùng granularity (userId + paymentId)
// để nhiều giao dịch khác nhau không ghi đè hoặc khóa chéo nhau.
function getStorageKey(userId: string, paymentId: string) {
  return `handygo:refund-pending:${encodeURIComponent(userId)}:${encodeURIComponent(paymentId)}:v1`;
}

function getLockName(userId: string, paymentId: string) {
  return `handygo:refund:${encodeURIComponent(userId)}:${encodeURIComponent(paymentId)}`;
}

function getSyncChannelName(userId: string, paymentId: string) {
  return `handygo:refund-sync:${encodeURIComponent(userId)}:${encodeURIComponent(paymentId)}`;
}

function parsePendingRefund(
  raw: string,
  userId: string,
  paymentId: string,
): PendingRefund {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Trạng thái hoàn tiền đã lưu không hợp lệ.");
  }

  const record = value as Record<string, unknown>;
  if (
    record.userId !== userId ||
    record.paymentId !== paymentId ||
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
    paymentId,
    amount: record.amount,
    reason: record.reason,
    idempotencyKey: record.idempotencyKey,
  };
}

function readPendingRefund(
  userId: string,
  paymentId: string,
): PendingRefund | null {
  const raw = window.localStorage.getItem(getStorageKey(userId, paymentId));
  if (!raw) return null;
  return parsePendingRefund(raw, userId, paymentId);
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
    const saved = readPendingRefund(userId, paymentId);
    return {
      pendingRefund: saved,
      amount: saved ? saved.amount : "",
      reason: saved ? saved.reason : "",
      storageError: "",
    };
  } catch {
    // Không xóa dữ liệu hỏng: có thể là operation chưa rõ kết quả.
    return {
      pendingRefund: null,
      amount: "",
      reason: "",
      storageError:
        "Không thể đọc yêu cầu hoàn tiền đang chờ. Hãy xác minh danh sách hoàn tiền trước khi thao tác tiếp.",
    };
  }
}

type LockOutcome<T> = { acquired: true; value: T } | { acquired: false };

async function withRefundSubmitLock<T>(
  userId: string,
  paymentId: string,
  operation: () => Promise<T>,
): Promise<LockOutcome<T>> {
  const lockName = getLockName(userId, paymentId);
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(
      lockName,
      { mode: "exclusive", ifAvailable: true },
      async (lock) => {
        if (!lock) {
          return { acquired: false };
        }
        const value = await operation();
        return { acquired: true, value };
      },
    );
  }
  // Không chạy không khóa: hai tab có thể tạo hai idempotencyKey khác nhau.
  throw new Error(
    "Trình duyệt không hỗ trợ Web Locks; không thể gửi refund an toàn.",
  );
}

function postSyncMessage(
  userId: string,
  paymentId: string,
  message: RefundSyncMessage,
) {
  if (typeof BroadcastChannel === "undefined") return;
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(getSyncChannelName(userId, paymentId));
    channel.postMessage(message);
  } catch {
    // Bỏ qua lỗi BroadcastChannel nếu môi trường không hỗ trợ đầy đủ.
  } finally {
    channel?.close();
  }
}

export default function CreateRefundDialog({
  paymentId,
  disabled,
  refundableAmount,
  capacitySnapshot,
  capacityLoading,
  capacityError,
  onRetryCapacity,
  onVerifyCapacity,
  onRefreshState,
  onCreated,
  onSubmittingChange,
}: CreateRefundDialogProps) {
  const user = useAuthUser();
  const currentSnapshot = capacitySnapshot ?? refundableAmount;
  // Parent render <CreateRefundDialog key={`${user.id}:${payment.id}`} ... />
  // nên khi user hoặc paymentId thay đổi, React khởi tạo lại state sạch.
  const [initial] = useState(() => getInitialRefundState(user.id, paymentId));
  const [amount, setAmount] = useState(initial.amount);
  const [reason, setReason] = useState(initial.reason);
  const [formError, setFormError] = useState("");
  const [pendingRefund, setPendingRefund] = useState<PendingRefund | null>(
    initial.pendingRefund,
  );
  const [storageError, setStorageError] = useState(initial.storageError);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshingCapacity, setIsRefreshingCapacity] = useState(false);
  const [needsCapacityReview, setNeedsCapacityReview] = useState(false);
  // Chốt snapshot ban đầu của form; không tự động ghi đè khi React Query
  // refetchOnWindowFocus cập nhật ngầm lúc đổi từ tab khác quay lại.
  const [acknowledgedSnapshot, setAcknowledgedSnapshot] = useState<
    string | null
  >(currentSnapshot);
  if (acknowledgedSnapshot === null && currentSnapshot !== null) {
    setAcknowledgedSnapshot(currentSnapshot);
  }

  const submittingRef = useRef(false);
  const tabIdRef = useRef<string | null>(null);
  const onRefreshStateRef = useRef(onRefreshState);
  const mutation = useCreateRefund();

  useEffect(() => {
    onRefreshStateRef.current = onRefreshState;
  }, [onRefreshState]);

  useEffect(() => {
    if (!tabIdRef.current) {
      tabIdRef.current =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;
    }
    const senderTabId = tabIdRef.current;
    const storageKey = getStorageKey(user.id, paymentId);

    function handleStorage(event: StorageEvent) {
      if (event.storageArea !== window.localStorage || event.key !== storageKey) {
        return;
      }

      if (event.newValue === null) {
        setPendingRefund(null);
        setStorageError("");
        if (event.oldValue !== null) {
          setNeedsCapacityReview(true);
          setFormError(
            "Yêu cầu hoàn tiền đang chờ đã được hoàn tất hoặc hủy ở tab khác. Hãy kiểm tra danh sách hoàn tiền và làm mới hạn mức trước khi thao tác tiếp.",
          );
          onRefreshStateRef.current?.();
        }
        return;
      }

      try {
        const parsed = parsePendingRefund(event.newValue, user.id, paymentId);
        setPendingRefund(parsed);
        setAmount(parsed.amount);
        setReason(parsed.reason);
        setStorageError("");
        setFormError("");
      } catch {
        setPendingRefund(null);
        setStorageError(
          "Không thể đọc yêu cầu hoàn tiền đang chờ. Hãy xác minh danh sách hoàn tiền trước khi thao tác tiếp.",
        );
      }
    }

    window.addEventListener("storage", handleStorage);

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      try {
        channel = new BroadcastChannel(getSyncChannelName(user.id, paymentId));
        channel.onmessage = (event: MessageEvent<RefundSyncMessage>) => {
          if (!event.data || event.data.senderTabId === senderTabId) return;

          if (event.data.type === "refund-created") {
            setNeedsCapacityReview(true);
            setFormError(
              "Một tab khác vừa tạo yêu cầu hoàn tiền cho giao dịch này. Hãy kiểm tra danh sách hoàn tiền và làm mới hạn mức trước khi gửi yêu cầu mới.",
            );
            onRefreshStateRef.current?.();
          } else if (event.data.type === "pending-cleared") {
            setPendingRefund(null);
            setStorageError("");
            setNeedsCapacityReview(true);
            onRefreshStateRef.current?.();
          }
        };
      } catch {
        channel = null;
      }
    }

    return () => {
      window.removeEventListener("storage", handleStorage);
      channel?.close();
    };
  }, [user.id, paymentId]);

  function clearError() {
    setFormError("");
    if (mutation.isError) mutation.reset();
  }

  async function acknowledgeLatestCapacity() {
    if (isRefreshingCapacity || submittingRef.current || isSubmitting) return;
    setIsRefreshingCapacity(true);
    setFormError("");

    try {
      if (onVerifyCapacity) {
        const fresh = await onVerifyCapacity();
        setAcknowledgedSnapshot(
          fresh.capacitySnapshot ?? fresh.refundableAmount,
        );
      } else {
        setAcknowledgedSnapshot(currentSnapshot);
      }
      setNeedsCapacityReview(false);
      onRefreshState?.();
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Không thể làm mới hạn mức hoàn tiền. Vui lòng thử lại.",
      );
    } finally {
      setIsRefreshingCapacity(false);
    }
  }

  const isPending = mutation.isPending || isSubmitting;
  const isRetryingPending = Boolean(pendingRefund);
  const snapshotChangedSinceAck = Boolean(
    !isRetryingPending &&
      acknowledgedSnapshot !== null &&
      currentSnapshot !== null &&
      currentSnapshot !== acknowledgedSnapshot,
  );
  const requiresCapacityReview =
    !isRetryingPending && (needsCapacityReview || snapshotChangedSinceAck);

  // Retry của yêu cầu chưa rõ kết quả KHÔNG được chặn do hạn mức mới
  // có thể đã giảm vì chính yêu cầu cũ đã được Backend ghi nhận.
  const capacityUnavailable =
    !isRetryingPending &&
    (capacityLoading ||
      Boolean(capacityError) ||
      refundableAmount === null ||
      refundableAmount === "0");
  // Payment không còn eligible chỉ chặn request MỚI.
  // Operation cũ vẫn phải có đường retry với đúng key đã lưu.
  const cannotCreateNewRefund = disabled && !isRetryingPending;
  const isBlocked =
    cannotCreateNewRefund ||
    isPending ||
    isRefreshingCapacity ||
    Boolean(storageError) ||
    requiresCapacityReview ||
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

    if (!isRetryingPending) {
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

    const storageKey = getStorageKey(user.id, paymentId);
    const senderTabId = tabIdRef.current ?? "unknown";

    // Bật toàn bộ guard TRƯỚC khi await lock để chặn double-click/Enter lúc lock đang bận.
    submittingRef.current = true;
    setIsSubmitting(true);
    onSubmittingChange?.(true);

    try {
      const lockOutcome = await withRefundSubmitLock(
        user.id,
        paymentId,
        async () => {
          let operation: PendingRefund;
          let isRetryOperation = isRetryingPending;
          try {
            // Đọc lại storage ngay lúc nhận lock, không dựa vào state cũ của modal.
            const saved = readPendingRefund(user.id, paymentId);
            if (saved) {
              isRetryOperation = true;
              setPendingRefund(saved);
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
              // Nếu tab này đang định retry một pending operation nhưng storage đã mất
              // (do tab khác vừa hoàn tất hoặc hủy), tuyệt đối không tự sinh key mới.
              if (isRetryingPending) {
                setPendingRefund(null);
                setNeedsCapacityReview(true);
                setFormError(
                  "Yêu cầu đang chờ đã được hoàn tất hoặc hủy ở tab khác. Hãy kiểm tra danh sách hoàn tiền trước khi tạo yêu cầu mới.",
                );
                onRefreshState?.();
                return;
              }

              if (disabled) {
                setFormError(
                  "Giao dịch không còn đủ điều kiện tạo yêu cầu hoàn tiền mới.",
                );
                return;
              }

              // Xác minh trạng thái và snapshot mới nhất từ backend trước khi sinh idempotencyKey mới.
              if (onVerifyCapacity) {
                let fresh: VerifiedCapacity;
                try {
                  fresh = await onVerifyCapacity();
                } catch (verifyError) {
                  setFormError(
                    verifyError instanceof Error
                      ? verifyError.message
                      : "Không thể xác minh hạn mức hoàn tiền mới nhất.",
                  );
                  return;
                }

                if (fresh.disabled) {
                  setFormError(
                    "Giao dịch không còn đủ điều kiện tạo yêu cầu hoàn tiền mới.",
                  );
                  onRefreshState?.();
                  return;
                }
                if (
                  fresh.refundableAmount === null ||
                  fresh.refundableAmount === "0"
                ) {
                  setFormError("Giao dịch đã hết hạn mức hoàn tiền.");
                  onRefreshState?.();
                  return;
                }
                if (BigInt(normalizedAmount) > BigInt(fresh.refundableAmount)) {
                  setFormError(
                    `Số tiền vượt hạn mức còn có thể hoàn (${new Intl.NumberFormat("vi-VN").format(BigInt(fresh.refundableAmount))} VND).`,
                  );
                  setNeedsCapacityReview(true);
                  onRefreshState?.();
                  return;
                }

                const freshSnapshot =
                  fresh.capacitySnapshot ?? fresh.refundableAmount;
                if (
                  acknowledgedSnapshot !== null &&
                  freshSnapshot !== null &&
                  freshSnapshot !== acknowledgedSnapshot
                ) {
                  setNeedsCapacityReview(true);
                  setFormError(
                    "Dữ liệu hoàn tiền của giao dịch vừa thay đổi từ thao tác khác. Hãy kiểm tra danh sách và làm mới hạn mức trước khi gửi yêu cầu mới.",
                  );
                  onRefreshState?.();
                  return;
                }
              } else if (
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
              window.localStorage.setItem(storageKey, JSON.stringify(operation));
              setPendingRefund(operation);
              postSyncMessage(user.id, paymentId, {
                type: "pending-updated",
                senderTabId,
              });
            }
          } catch {
            setStorageError(
              "Không thể lưu/đọc yêu cầu đang chờ. Đã dừng để tránh tạo hoàn tiền trùng.",
            );
            return;
          }

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
              const stored = readPendingRefund(user.id, paymentId);
              if (stored?.idempotencyKey === operation.idempotencyKey) {
                window.localStorage.removeItem(storageKey);
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

            postSyncMessage(user.id, paymentId, {
              type: "refund-created",
              senderTabId,
            });
            setPendingRefund(null);
            setAmount("");
            setReason("");
            setFormError("");
            setNeedsCapacityReview(false);
            toast.success("Đã tạo yêu cầu hoàn tiền");
            // Báo cho modal cha mở khóa trước khi yêu cầu đóng modal.
            submittingRef.current = false;
            setIsSubmitting(false);
            onSubmittingChange?.(false);
            onCreated?.();
          } catch (caught) {
            const classified = classifyCreateRefundError(caught, {
              isRetry: isRetryOperation,
            });

            if (classified.kind === "definitive_rejection") {
              try {
                const stored = readPendingRefund(user.id, paymentId);
                if (stored?.idempotencyKey === operation.idempotencyKey) {
                  window.localStorage.removeItem(storageKey);
                }
                setPendingRefund(null);
                postSyncMessage(user.id, paymentId, {
                  type: "pending-cleared",
                  senderTabId,
                });
                mutation.reset();
                setFormError(classified.message);

                if (onVerifyCapacity) {
                  try {
                    const fresh = await onVerifyCapacity();
                    setAcknowledgedSnapshot(
                      fresh.capacitySnapshot ?? fresh.refundableAmount,
                    );
                  } catch {
                    setNeedsCapacityReview(true);
                  }
                }
                onRefreshState?.();
              } catch {
                setStorageError(
                  "Yêu cầu bị từ chối nhưng không thể xóa trạng thái đã lưu. Hãy xác minh danh sách hoàn tiền trước khi thao tác tiếp.",
                );
              }
              return;
            }

            if (classified.kind === "idempotency_conflict") {
              setFormError(classified.message);
              onRefreshState?.();
              return;
            }

            // Không xóa key khi lỗi mạng/timeout/403/404/5xx hoặc lỗi chưa xác minh được kết quả.
            setFormError(
              `${classified.message} Yêu cầu và mã chống trùng đã được giữ lại. Hãy kiểm tra danh sách hoàn tiền trước khi thử lại; chỉ gửi lại đúng yêu cầu cũ.`,
            );
          }
        },
      );

      if (!lockOutcome.acquired) {
        setFormError(
          "Giao dịch này đang được xử lý hoàn tiền ở một tab khác. Vui lòng kiểm tra danh sách hoàn tiền và hạn mức trước khi thao tác tiếp.",
        );
        onRefreshState?.();
      }
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Không thể khóa thao tác hoàn tiền. Vui lòng thử lại.",
      );
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
      onSubmittingChange?.(false);
    }
  }

  const error = storageError || formError;

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

      {(pendingRefund || storageError) && (
        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-[12px] leading-5 text-amber-900">
          <div className="flex items-start gap-2">
            <Info size={16} className="mt-0.5 shrink-0" />
            <p>
              {storageError
                ? "Dữ liệu khôi phục hoàn tiền đang gặp lỗi đọc. Đã tạm dừng gửi yêu cầu mới để tránh hoàn tiền trùng; hãy kiểm tra danh sách hoàn tiền."
                : "Có yêu cầu trước đó chưa xác định kết quả. Nội dung đã được khôi phục và khóa để retry bằng mã chống trùng cũ. Hãy kiểm tra danh sách refund hoặc bấm gửi lại đúng yêu cầu cũ."}
            </p>
          </div>
          {onRefreshState && (
            <div className="pl-6">
              <button
                type="button"
                disabled={isPending || isRefreshingCapacity}
                onClick={onRefreshState}
                className="font-medium text-amber-900 underline disabled:opacity-50"
              >
                Làm mới danh sách
              </button>
            </div>
          )}
        </div>
      )}

      {requiresCapacityReview && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-900">
          <span>
            Dữ liệu hoàn tiền của giao dịch vừa thay đổi từ thao tác khác. Hãy
            kiểm tra danh sách và xác nhận hạn mức mới trước khi gửi yêu cầu
            mới.
          </span>
          <button
            type="button"
            disabled={isPending || isRefreshingCapacity}
            onClick={() => void acknowledgeLatestCapacity()}
            className="font-medium text-amber-900 underline disabled:opacity-50"
          >
            {isRefreshingCapacity ? "Đang làm mới..." : "Làm mới & tiếp tục"}
          </button>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-[12px] text-slate-500">Số tiền còn có thể hoàn</p>
        {capacityLoading && !isRetryingPending ? (
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
        {refundableAmount === "0" && !isRetryingPending && (
          <p className="mt-1 text-[12px] text-amber-700">
            Giao dịch đã hết hạn mức hoàn tiền.
          </p>
        )}
        {isRetryingPending && (
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
            disabled={isBlocked || isRetryingPending}
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
        {!isRetryingPending &&
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
          disabled={isBlocked || isRetryingPending}
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
          ) : isRetryingPending ? (
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
