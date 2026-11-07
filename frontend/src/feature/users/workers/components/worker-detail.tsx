"use client";

import {
  BriefcaseBusiness,
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
  if (!value || Number.isNaN(new Date(value).getTime())) {
    return "—";
  }

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
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="break-words text-sm font-medium">
        {value === null || value === undefined || value === "" ? "—" : value}
      </p>
    </div>
  );
}

function CopyField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>

      <div className="flex items-center gap-2">
        <span
          className="min-w-0 truncate text-sm font-medium"
          title={value || undefined}
        >
          {value || "—"}
        </span>

        {value && (
          <button
            type="button"
            aria-label={`Sao chép ${label}`}
            onClick={() => {
              void navigator.clipboard.writeText(value);
            }}
            className="shrink-0 text-muted-foreground hover:text-[#FF5E14]"
          >
            <Copy className="size-3.5" />
          </button>
        )}
      </div>
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
      onOpenChange={(open: boolean) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="
          flex max-h-[85dvh] w-[94vw] max-w-[680px]
          flex-col gap-0 overflow-hidden
          rounded-2xl bg-white p-0
          sm:max-w-[680px]
          [&>button]:hidden
        "
      >
        {/* HEADER */}
        <DialogHeader
          className="
            flex shrink-0 flex-row items-start
            justify-between gap-3
            border-b px-5 py-4 text-left sm:px-6
          "
        >
          <div className="space-y-1">
            <DialogTitle className="text-lg font-semibold">
              Chi tiết thợ
            </DialogTitle>

            <DialogDescription>
              Thông tin tài khoản và hồ sơ hoạt động
            </DialogDescription>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="
              rounded-md p-1.5 text-muted-foreground
              hover:bg-muted hover:text-foreground
            "
          >
            <X className="size-5" />
          </button>
        </DialogHeader>

        {/* NỘI DUNG CUỘN */}
        <div
          className="
            min-h-0 flex-1 overflow-y-auto
            overscroll-contain
            [scrollbar-width:thin]
            [scrollbar-color:#A3A3A3_transparent]
          "
        >
          {isPending ? (
            <div className="space-y-5 p-6">
              <div className="flex items-center gap-4">
                <Skeleton className="size-16 rounded-xl" />

                <div className="space-y-2">
                  <Skeleton className="h-5 w-44" />
                  <Skeleton className="h-4 w-28" />
                </div>
              </div>

              <Skeleton className="h-44 w-full rounded-xl" />
              <Skeleton className="h-52 w-full rounded-xl" />
            </div>
          ) : isError || !user ? (
            <p className="px-6 py-12 text-center text-sm text-destructive">
              Không thể tải thông tin thợ. Vui lòng thử lại.
            </p>
          ) : (
            <div className="space-y-4 px-5 py-4 sm:px-6">
              {/* THÔNG TIN THỢ */}
              <div className="flex items-center gap-4">
                <div
                  className="
                    flex size-16 shrink-0 items-center
                    justify-center overflow-hidden rounded-xl
                    bg-[#FF5E14]/10
                  "
                >
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
                  <h3 className="truncate text-lg font-semibold">
                    {user.fullName || "Chưa cập nhật tên"}
                  </h3>

                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="
                        rounded-md bg-emerald-50
                        px-2 py-0.5 text-xs text-emerald-700
                      "
                    >
                      {accountStatus}
                    </span>

                    <span
                      className={`
                        rounded-md px-2 py-0.5 text-xs
                        ${workerStatusClass}
                      `}
                    >
                      {workerStatus}
                    </span>
                  </div>

                  {/* ĐÁNH GIÁ DƯỚI TÊN */}
                  <div className="flex items-center gap-1.5 text-sm">
                    <Star className="size-4 text-amber-500" />

                    {hasRating ? (
                      <>
                        <span className="font-medium text-foreground">
                          {profile?.averageRating ?? "—"} / 5
                        </span>

                        <span className="text-muted-foreground">
                          Đánh giá trung bình
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">
                        Chưa có đánh giá
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* THÔNG TIN TÀI KHOẢN */}
              <section className="space-y-3 rounded-xl border p-4">
                <h4 className="flex items-center gap-2 text-sm font-semibold">
                  <IdCard className="size-4 text-[#FF5E14]" />
                  Thông tin tài khoản
                </h4>

                <div
                  className="
                    grid grid-cols-1 gap-x-5 gap-y-3
                    border-t pt-3 sm:grid-cols-2
                  "
                >
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

              {/* HỒ SƠ THỢ */}
              <section className="space-y-3 rounded-xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="flex items-center gap-2 text-sm font-semibold">
                    <BriefcaseBusiness className="size-4 text-[#FF5E14]" />
                    Hồ sơ thợ
                  </h4>

                  <span
                    className={`
                      rounded-md px-2 py-0.5 text-xs
                      ${workerStatusClass}
                    `}
                  >
                    {workerStatus}
                  </span>
                </div>

                <div
                  className="
                    grid grid-cols-1 gap-x-5 gap-y-3
                    border-t pt-3 sm:grid-cols-2
                  "
                >
                  {/* MÃ HỒ SƠ THỢ */}
                  <div className="sm:col-span-2">
                    <CopyField label="Mã hồ sơ thợ" value={profile?.id} />
                  </div>

                  <Field
                    label="Tổng số đơn hàng"
                    value={
                      profile?.orderCountTotal != null
                        ? `${profile.orderCountTotal} đơn`
                        : "—"
                    }
                  />

                  <Field
                    label="Đơn hoàn thành"
                    value={
                      profile?.completedOrderCount != null
                        ? `${profile.completedOrderCount} đơn`
                        : "—"
                    }
                  />

                  <Field
                    label="Lượt đánh giá"
                    value={
                      profile?.ratingCount != null
                        ? `${profile.ratingCount} lượt`
                        : "—"
                    }
                  />

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
