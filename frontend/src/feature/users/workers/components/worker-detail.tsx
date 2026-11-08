"use client";

import {
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardList,
  Copy,
  IdCard,
  Star,
  UserRound,
  X,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserDetailQuery } from "../../hooks/use-users";

type Props = {
  userId: string | null;
  onClose: () => void;
};

const formatDate = (value?: string | null) => {
  if (!value || Number.isNaN(new Date(value).getTime())) return "—";

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
};

const getAccountStatus = (status?: string | null) => {
  switch (status) {
    case "active":
      return "Đang hoạt động";
    case "inactive":
      return "Ngừng hoạt động";
    case "suspended":
      return "Bị tạm khóa";
    case "banned":
      return "Bị khóa";
    default:
      return status || "—";
  }
};

const getWorkerStatus = (status?: string | null) => {
  switch (status) {
    case "draft":
      return "Bản nháp";
    case "pending":
      return "Chờ duyệt";
    case "reviewing":
      return "Đang xét duyệt";
    case "verified":
      return "Đã xác minh";
    case "approved":
      return "Đã duyệt";
    case "rejected":
      return "Đã từ chối";
    default:
      return status || "—";
  }
};

const getWorkerStatusClass = (status?: string | null) => {
  switch (status) {
    case "verified":
    case "approved":
      return "bg-emerald-50 text-emerald-700";
    case "pending":
    case "reviewing":
      return "bg-amber-50 text-amber-700";
    case "rejected":
      return "bg-red-50 text-red-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
};

function Field({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-[12px] font-normal text-slate-500">{label}</p>
      <p className="break-words text-[13px] font-normal text-slate-900">
        {value === null || value === undefined || value === "" ? "—" : value}
      </p>
    </div>
  );
}

function CopyField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-[12px] text-slate-500">{label}</p>

      <div className="flex items-center gap-2">
        <span
          className="min-w-0 truncate text-[13px] font-normal text-slate-900"
          title={value || undefined}
        >
          {value || "—"}
        </span>

        {value && (
          <button
            type="button"
            aria-label={`Sao chép ${label}`}
            onClick={() => void navigator.clipboard.writeText(value)}
            className="shrink-0 cursor-pointer text-slate-400 transition-colors hover:text-[#FF5E14]"
          >
            <Copy size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | null | undefined;
  icon: typeof Star;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-100 bg-slate-50/80 px-2 py-3 text-center sm:px-3">
      <Icon size={16} className="text-[#FF5E14]" />

      <span className="text-[16px] font-semibold tabular-nums text-slate-900 sm:text-[18px]">
        {value ?? "—"}
      </span>

      <span className="text-[11px] font-normal leading-4 text-slate-500 sm:text-[12px]">
        {label}
      </span>
    </div>
  );
}

export default function WorkerDetailModal({ userId, onClose }: Props) {
  const {
    data: user,
    isPending,
    isError,
  } = useUserDetailQuery(userId ?? undefined);

  const profile = user?.workerProfile;

  const accountStatus = getAccountStatus(user?.status);
  const workerStatus = getWorkerStatus(profile?.status);
  const workerStatusClass = getWorkerStatusClass(profile?.status);

  const ratingCount = profile?.ratingCount ?? 0;
  const hasRating = ratingCount > 0;

  return (
    <Dialog
      open={Boolean(userId)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        overlayClassName="z-[120]"
        className="
          z-[130] flex max-h-[85dvh] w-[94vw] max-w-[640px]
          flex-col gap-0 overflow-hidden rounded-2xl bg-white p-0
          font-['Inter',sans-serif] text-slate-900 antialiased
          sm:max-w-[640px] [&>button]:hidden
        "
      >
        {/* HEADER */}
        <DialogHeader className="flex shrink-0 flex-row items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 text-left sm:px-6">
          <div className="space-y-1">
            <DialogTitle className="text-[16px] font-semibold text-slate-900 sm:text-[19px]">
              Chi tiết thợ
            </DialogTitle>
            <DialogDescription className="text-[12px] font-normal text-slate-500 sm:text-[13px]">
              Thông tin tài khoản và hồ sơ hoạt động
            </DialogDescription>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <X size={20} />
          </button>
        </DialogHeader>

        {/* BODY */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin] [scrollbar-color:#CBD5E1_transparent]">
          {isPending ? (
            <div className="space-y-5 p-6">
              <div className="flex items-center gap-4">
                <Skeleton className="size-16 rounded-xl" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-44" />
                  <Skeleton className="h-4 w-28" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-24 rounded-xl" />
                ))}
              </div>

              <Skeleton className="h-44 w-full rounded-xl" />
              <Skeleton className="h-44 w-full rounded-xl" />
            </div>
          ) : isError || !user ? (
            <p className="px-6 py-12 text-center text-[13px] text-rose-600">
              Không thể tải thông tin thợ. Vui lòng thử lại.
            </p>
          ) : (
            <div className="space-y-4 px-5 py-5 sm:px-6">
              {/* WORKER PROFILE */}
              <div className="flex items-center gap-4">
                <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#FF5E14]/10">
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt="Ảnh đại diện"
                      className="size-full object-cover"
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    <UserRound className="size-8 text-[#FF5E14]" />
                  )}
                </div>

                <div className="min-w-0 space-y-1.5">
                  <h3 className="truncate text-[16px] font-semibold text-slate-900">
                    {user.fullName || "Chưa cập nhật tên"}
                  </h3>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                      {accountStatus}
                    </span>

                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] ${workerStatusClass}`}
                    >
                      {workerStatus}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-[12px]">
                    <Star size={15} className="text-amber-500" />

                    {hasRating ? (
                      <>
                        <span className="font-normal text-slate-900">
                          {profile?.averageRating ?? "—"} / 5
                        </span>
                        <span className="text-slate-500">
                          Đánh giá trung bình
                        </span>
                      </>
                    ) : (
                      <span className="text-slate-500">Chưa có đánh giá</span>
                    )}
                  </div>
                </div>
              </div>

              {/* QUICK STATISTICS */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <StatCard
                  label="Tổng đơn hàng"
                  value={profile?.orderCountTotal}
                  icon={ClipboardList}
                />
                <StatCard
                  label="Đơn hoàn thành"
                  value={profile?.completedOrderCount}
                  icon={CheckCircle2}
                />
                <StatCard
                  label="Lượt đánh giá"
                  value={profile?.ratingCount}
                  icon={Star}
                />
              </div>

              {/* ACCOUNT INFORMATION */}
              <section className="space-y-3 rounded-xl border border-slate-200 p-4">
                <h4 className="flex items-center gap-2 text-[13px] font-semibold text-slate-900">
                  <IdCard size={16} className="text-[#FF5E14]" />
                  Thông tin tài khoản
                </h4>

                <div className="grid grid-cols-1 gap-x-5 gap-y-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
                  <CopyField label="Mã người dùng" value={user.id} />

                  <Field label="Trạng thái tài khoản" value={accountStatus} />

                  <Field
                    label="Ngày tạo tài khoản"
                    value={formatDate(user.createdAt)}
                  />

                  <Field
                    label="Cập nhật gần nhất"
                    value={formatDate(user.updatedAt)}
                  />
                </div>
              </section>

              {/* WORKER PROFILE INFORMATION */}
              <section className="space-y-3 rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="flex items-center gap-2 text-[13px] font-semibold text-slate-900">
                    <BriefcaseBusiness size={16} className="text-[#FF5E14]" />
                    Hồ sơ thợ
                  </h4>

                  <span
                    className={`rounded-md px-2 py-0.5 text-[11px] ${workerStatusClass}`}
                  >
                    {workerStatus}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-x-5 gap-y-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <CopyField label="Mã hồ sơ thợ" value={profile?.id} />
                  </div>

                  <Field
                    label="Ngày xác minh"
                    value={formatDate(profile?.verifiedAt)}
                  />

                  <Field
                    label="Ngày phê duyệt"
                    value={formatDate(profile?.approvedAt)}
                  />

                  <Field
                    label="Ngày tạo hồ sơ"
                    value={formatDate(profile?.createdAt)}
                  />

                  <Field
                    label="Cập nhật hồ sơ"
                    value={formatDate(profile?.updatedAt)}
                  />
                </div>
              </section>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
