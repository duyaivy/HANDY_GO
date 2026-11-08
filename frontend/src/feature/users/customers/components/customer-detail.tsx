"use client";

import { Copy, IdCard, UserRound, X } from "lucide-react";
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

const formatDate = (value?: string | null) =>
  value && !Number.isNaN(new Date(value).getTime())
    ? new Intl.DateTimeFormat("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date(value))
    : "—";

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

export default function CustomerDetailModal({ userId, onClose }: Props) {
  const {
    data: user,
    isPending,
    isError,
  } = useUserDetailQuery(userId ?? undefined);

  const profile = user?.customerProfile;

  const status =
    user?.status === "active"
      ? "Đang hoạt động"
      : user?.status === "inactive"
        ? "Ngừng hoạt động"
        : (user?.status ?? "—");

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
          z-[130]
          flex max-h-[85dvh] w-[94vw] max-w-[640px]
          flex-col gap-0 overflow-hidden
          rounded-2xl bg-white p-0
          font-['Inter',sans-serif] text-slate-900 antialiased
          sm:max-w-[640px]
          [&>button]:hidden
        "
      >
        {/* HEADER */}
        <DialogHeader className="flex shrink-0 flex-row items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 text-left sm:px-6">
          <div className="space-y-1">
            <DialogTitle className="text-[16px] font-semibold text-slate-900 sm:text-[19px]">
              Chi tiết khách hàng
            </DialogTitle>

            <DialogDescription className="text-[12px] font-normal text-slate-500 sm:text-[13px]">
              Thông tin tài khoản và hồ sơ khách hàng
            </DialogDescription>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="
              rounded-lg p-1.5 text-slate-400
              transition-colors
              hover:bg-slate-100 hover:text-slate-900
            "
          >
            <X size={20} />
          </button>
        </DialogHeader>

        {/* BODY */}
        <div
          className="
            min-h-0 flex-1 overflow-y-auto overscroll-contain
            [scrollbar-width:thin]
            [scrollbar-color:#CBD5E1_transparent]
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
              <Skeleton className="h-36 w-full rounded-xl" />
            </div>
          ) : isError || !user ? (
            <p className="px-6 py-12 text-center text-[13px] font-normal text-rose-600">
              Không thể tải thông tin khách hàng. Vui lòng thử lại.
            </p>
          ) : (
            <div className="space-y-4 px-5 py-5 sm:px-6">
              {/* CUSTOMER PROFILE */}
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
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-normal text-slate-700">
                      Khách hàng
                    </span>

                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] font-normal ${
                        user.status === "active"
                          ? "bg-emerald-50 text-emerald-700"
                          : user.status === "inactive"
                            ? "bg-slate-100 text-slate-600"
                            : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {status}
                    </span>
                  </div>
                </div>
              </div>

              {/* ACCOUNT INFORMATION */}
              <section className="space-y-3 rounded-xl border border-slate-200 p-4">
                <h4 className="flex items-center gap-2 text-[13px] font-semibold text-slate-900">
                  <IdCard size={16} className="text-[#FF5E14]" />
                  Thông tin tài khoản
                </h4>

                <div className="grid grid-cols-1 gap-x-5 gap-y-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
                  <div className="min-w-0 space-y-1">
                    <p className="text-[12px] font-normal text-slate-500">
                      Mã người dùng
                    </p>

                    <div className="flex items-center gap-2">
                      <span
                        className="truncate text-[13px] font-normal text-slate-900"
                        title={user.id}
                      >
                        {user.id}
                      </span>

                      <button
                        type="button"
                        aria-label="Sao chép mã người dùng"
                        onClick={() => navigator.clipboard.writeText(user.id)}
                        className="
                          shrink-0 cursor-pointer text-slate-400
                          transition-colors hover:text-[#FF5E14]
                        "
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                  </div>

                  <Field label="Trạng thái tài khoản" value={status} />

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

              {/* CUSTOMER PROFILE INFORMATION */}
              <section className="space-y-3 rounded-xl border border-slate-200 p-4">
                <h4 className="flex items-center gap-2 text-[13px] font-semibold text-slate-900">
                  <UserRound size={16} className="text-[#FF5E14]" />
                  Hồ sơ khách hàng
                </h4>

                <div className="space-y-3 border-t border-slate-100 pt-3">
                  <Field
                    label="Giới thiệu"
                    value={profile?.bio || "Chưa cập nhật thông tin giới thiệu"}
                  />

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field
                      label="Ngày tạo hồ sơ"
                      value={formatDate(profile?.createdAt)}
                    />

                    <Field
                      label="Cập nhật hồ sơ"
                      value={formatDate(profile?.updatedAt)}
                    />
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
