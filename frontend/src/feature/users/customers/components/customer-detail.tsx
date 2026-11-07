"use client";

import { Copy, IdCard, UserRound, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserDetailQuery } from "../../hooks/use-users";


type Props = { userId: string | null; onClose: () => void };

const formatDate = (value?: string | null) =>
  value && !Number.isNaN(new Date(value).getTime())
    ? new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value))
    : "—";

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="break-words text-sm font-medium text-foreground">{value === null || value === undefined || value === "" ? "—" : value}</p>
    </div>
  );
}

export default function CustomerDetailModal({ userId, onClose }: Props) {
  const { data: user, isPending, isError } = useUserDetailQuery(userId ?? undefined);
  const profile = user?.customerProfile;
  const status = user?.status === "active" ? "Đang hoạt động" : user?.status === "inactive" ? "Ngừng hoạt động" : user?.status ?? "—";

  return (
    <Dialog open={Boolean(userId)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex max-h-[85dvh] w-[94vw] max-w-[640px] flex-col gap-0 overflow-hidden rounded-2xl bg-white p-0 sm:max-w-[640px] [&>button]:hidden">
        <DialogHeader className="flex shrink-0 flex-row items-start justify-between gap-3 border-b px-5 py-4 text-left sm:px-6">
          <div className="space-y-1">
            <DialogTitle className="text-lg font-semibold">Chi tiết khách hàng</DialogTitle>
            <DialogDescription>Thông tin tài khoản và hồ sơ khách hàng</DialogDescription>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-5" /></button>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin] [scrollbar-color:#A3A3A3_transparent]">
        {isPending ? (
          <div className="space-y-5 p-6"><div className="flex items-center gap-4"><Skeleton className="size-16 rounded-xl" /><div className="space-y-2"><Skeleton className="h-5 w-44" /><Skeleton className="h-4 w-28" /></div></div><Skeleton className="h-44 w-full rounded-xl" /><Skeleton className="h-36 w-full rounded-xl" /></div>
        ) : isError || !user ? (
          <p className="px-6 py-12 text-center text-sm text-destructive">Không thể tải thông tin khách hàng. Vui lòng thử lại.</p>
        ) : (
          <div className="space-y-4 px-5 py-4 sm:px-6">
            <div className="flex items-center gap-4">
              <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#FF5E14]/10">
                {user.avatarUrl ? <img src={user.avatarUrl} alt="Ảnh đại diện" className="size-full object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <UserRound className="size-8 text-[#FF5E14]" />}
              </div>
              <div className="min-w-0 space-y-1.5"><h3 className="truncate text-lg font-semibold">{user.fullName || "Chưa cập nhật tên"}</h3><div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700">Khách hàng</span><span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">{status}</span></div></div>
            </div>

            <section className="space-y-3 rounded-xl border p-4">
              <h4 className="flex items-center gap-2 text-sm font-semibold"><IdCard className="size-4 text-[#FF5E14]" />Thông tin tài khoản</h4>
              <div className="grid grid-cols-1 gap-x-5 gap-y-3 border-t pt-3 sm:grid-cols-2">
                <div className="min-w-0 space-y-1"><p className="text-xs text-muted-foreground">Mã người dùng</p><div className="flex items-center gap-2"><span className="truncate text-sm font-medium" title={user.id}>{user.id}</span><button type="button" aria-label="Sao chép mã người dùng" onClick={() => navigator.clipboard.writeText(user.id)} className="shrink-0 text-muted-foreground hover:text-[#FF5E14]"><Copy className="size-3.5" /></button></div></div>
                <Field label="Trạng thái tài khoản" value={status} />
                <Field label="Ngày tạo tài khoản" value={formatDate(user.createdAt)} />
                <Field label="Cập nhật gần nhất" value={formatDate(user.updatedAt)} />
              </div>
            </section>

            <section className="space-y-3 rounded-xl border p-4">
              <h4 className="flex items-center gap-2 text-sm font-semibold"><UserRound className="size-4 text-[#FF5E14]" />Hồ sơ khách hàng</h4>
              <div className="space-y-3 border-t pt-3">
                <Field label="Giới thiệu" value={profile?.bio || "Chưa cập nhật thông tin giới thiệu"} />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field label="Ngày tạo hồ sơ" value={formatDate(profile?.createdAt)} /><Field label="Cập nhật hồ sơ" value={formatDate(profile?.updatedAt)} /></div>
              </div>
            </section>
          </div>
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
