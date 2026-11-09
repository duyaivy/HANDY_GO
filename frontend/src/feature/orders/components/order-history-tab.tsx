"use client";

import { useState } from "react";
import {
  AlertCircle,
  Ban,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  UserRound,
  Wrench,
} from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";

import { STATUS_LABELS } from "@/lib/order-utils";
import type { OrderStatusHistoryItem } from "../types";
import { useUserDetailQuery } from "@/feature/users/hooks/use-users";

type UserRole = "customer" | "worker";

interface Props {
  history: OrderStatusHistoryItem[];
  customerUserId?: string | null;
  workerUserId?: string | null;
  onViewUser?: (id: string, role: UserRole) => void;
}

const REASON_LABELS: Record<string, string> = {
  "Worker started work execution": "Thợ bắt đầu thực hiện công việc",
  "Worker confirmed readiness to execute work":
    "Thợ xác nhận sẵn sàng thực hiện công việc",
  "Order created upon worker acceptance of booking proposal":
    "Đơn hàng được tạo sau khi thợ chấp nhận đề xuất đặt lịch",
  "Worker completed work and submitted evidence for confirmation":
    "Thợ đã hoàn thành công việc và gửi bằng chứng để xác nhận",
  "Customer accepted work and confirmed order completion":
    "Khách hàng đã nghiệm thu và xác nhận hoàn thành đơn hàng",
};

function formatReason(reason?: string | null) {
  if (!reason?.trim()) return "Không có ghi chú";

  const normalized = reason.trim();
  return REASON_LABELS[normalized] ?? normalized;
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getStatusStyle(status: string) {
  switch (status) {
    case "disputed":
      return {
        icon: AlertCircle,
        iconColor: "text-orange-600",
        background: "bg-orange-50",
        border: "border-orange-100",
        line: "bg-orange-200",
      };

    case "completed":
      return {
        icon: CheckCircle2,
        iconColor: "text-emerald-600",
        background: "bg-emerald-50",
        border: "border-emerald-100",
        line: "bg-slate-200",
      };

    case "confirmed":
      return {
        icon: Check,
        iconColor: "text-emerald-600",
        background: "bg-emerald-50",
        border: "border-emerald-100",
        line: "bg-slate-200",
      };

    case "in_progress":
      return {
        icon: Wrench,
        iconColor: "text-slate-600",
        background: "bg-slate-100",
        border: "border-slate-200",
        line: "bg-slate-200",
      };

    case "cancelled":
    case "canceled":
      return {
        icon: Ban,
        iconColor: "text-rose-600",
        background: "bg-rose-50",
        border: "border-rose-100",
        line: "bg-slate-200",
      };

    case "awaiting_customer_confirmation":
    case "waiting_customer_confirmation":
    case "pending_customer_confirmation":
      return {
        icon: Clock3,
        iconColor: "text-slate-600",
        background: "bg-slate-100",
        border: "border-slate-200",
        line: "bg-slate-200",
      };

    default:
      return {
        icon: ClipboardCheck,
        iconColor: "text-slate-500",
        background: "bg-slate-50",
        border: "border-slate-200",
        line: "bg-slate-200",
      };
  }
}

interface HistoryUserProps {
  userId: string;
  customerUserId?: string | null;
  workerUserId?: string | null;
  onViewUser?: (id: string, role: UserRole) => void;
}

function HistoryUser({
  userId,
  customerUserId,
  workerUserId,
  onViewUser,
}: HistoryUserProps) {
  const { data: user, isPending } = useUserDetailQuery(userId);

  const fullName = user?.fullName?.trim() || userId;

  const role: UserRole | null =
    userId === customerUserId
      ? "customer"
      : userId === workerUserId
        ? "worker"
        : null;

  const canViewDetail = Boolean(role && onViewUser);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <UserRound
        size={13}
        strokeWidth={1.8}
        className="shrink-0 text-slate-400"
      />

      <span className="text-[11px] text-slate-500">Người thực hiện:</span>

      {isPending ? (
        <Skeleton className="h-6 w-28 rounded-md" />
      ) : (
        <button
          type="button"
          disabled={!canViewDetail}
          onClick={(event) => {
            event.stopPropagation();

            if (role) {
              onViewUser?.(userId, role);
            }
          }}
          title={fullName}
          className={`
            inline-flex max-w-full items-center gap-1.5
            rounded-md bg-slate-100 px-2 py-1
            text-[11px] font-medium text-slate-700
            transition-colors
            ${
              canViewDetail
                ? "cursor-pointer hover:bg-orange-50 hover:text-[#FF5E14]"
                : "cursor-default"
            }
          `}
        >
          <span className="truncate">{fullName}</span>
        </button>
      )}
    </div>
  );
}

export default function OrderHistoryTab({
  history,
  customerUserId,
  workerUserId,
  onViewUser,
}: Props) {
  const sortedHistory = [...history].sort((a, b) => {
    const timeA = new Date(a.createdAt).getTime();
    const timeB = new Date(b.createdAt).getTime();

    return (
      (Number.isNaN(timeB) ? 0 : timeB) - (Number.isNaN(timeA) ? 0 : timeA)
    );
  });

  if (sortedHistory.length === 0) {
    return (
      <div className="rounded-xl bg-slate-50 px-4 py-8 text-center">
        <Clock3 size={24} className="mx-auto mb-2 text-slate-300" />

        <p className="text-[13px] text-slate-500">
          Chưa có lịch sử trạng thái.
        </p>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold text-slate-900">
            Lịch sử trạng thái
          </h3>

          <p className="mt-0.5 text-[12px] text-slate-500">
            Theo dõi quá trình xử lý đơn hàng
          </p>
        </div>

        <span className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
          {sortedHistory.length} cập nhật
        </span>
      </div>

      <ol className="border-t border-slate-100 pt-5">
        {sortedHistory.map((item, index) => {
          const isLatest = index === 0;
          const isLast = index === sortedHistory.length - 1;

          const statusStyle = getStatusStyle(item.toStatus);
          const StatusIcon = statusStyle.icon;

          const fromStatus = item.fromStatus
            ? (STATUS_LABELS[item.fromStatus] ?? item.fromStatus)
            : null;

          const toStatus = STATUS_LABELS[item.toStatus] ?? item.toStatus;

          const isDispute = item.toStatus === "disputed";

          return (
            <li key={item.id} className="flex min-w-0 gap-2.5 sm:gap-3">
              {/* TIMELINE */}
              <div className="flex w-7 shrink-0 flex-col items-center">
                <div
                  className={`
                    relative z-10 flex h-7 w-7 shrink-0
                    items-center justify-center rounded-full border
                    ${statusStyle.background}
                    ${statusStyle.border}
                  `}
                >
                  <StatusIcon
                    size={14}
                    strokeWidth={2}
                    className={statusStyle.iconColor}
                  />
                </div>

                {!isLast && (
                  <div
                    className={`mt-1 w-[2px] flex-1 rounded-full ${
                      isLatest ? statusStyle.line : "bg-slate-200"
                    }`}
                  />
                )}
              </div>

              {/* NỘI DUNG */}
              <div className={`min-w-0 flex-1 ${isLast ? "" : "pb-5"}`}>
                <div className="flex min-w-0 flex-col items-start gap-1.5 sm:flex-row sm:flex-wrap sm:justify-between sm:gap-x-4">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h4 className="break-words text-[13px] font-semibold text-slate-900">
                      {item.fromStatus ? toStatus : "Đơn hàng được tạo"}
                    </h4>

                    {isLatest && (
                      <span className="rounded-md bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-700">
                        Mới nhất
                      </span>
                    )}
                  </div>

                  <time className="text-[11px] tabular-nums text-slate-400">
                    {formatDateTime(item.createdAt)}
                  </time>
                </div>

                {fromStatus && (
                  <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-[12px] text-slate-500">
                    <span>{fromStatus}</span>
                    <span className="text-slate-400">→</span>
                    <span>{toStatus}</span>
                  </div>
                )}

                {isDispute ? (
                  <div className="mt-2.5 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                    <p className="break-words text-[12.5px] leading-5 text-slate-700">
                      {formatReason(item.reason)}
                    </p>
                  </div>
                ) : (
                  <p className="mt-2 break-words text-[12.5px] leading-5 text-slate-700">
                    {formatReason(item.reason)}
                  </p>
                )}

                {item.changedByUserId && (
                  <div className="mt-2.5">
                    <HistoryUser
                      userId={item.changedByUserId}
                      customerUserId={customerUserId}
                      workerUserId={workerUserId}
                      onViewUser={onViewUser}
                    />
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
