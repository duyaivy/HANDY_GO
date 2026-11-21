"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Inbox,
  Play,
  RefreshCw,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  useDeadLettersQuery,
  useReconcilePayments,
  useReplayDeadLetter,
  useReportsQuery,
  useResolveSandboxPayout,
} from "../hooks/use-operations";
import { DEAD_LETTER_STATUS, getOperationErrorMessage } from "../operation-utils";
import { formatPaymentDate } from "../payment-utils";
import { PAYMENT_ID_PATTERN } from "../schemas/payment.schema";
import type { DeadLetter, ReconciliationResult } from "../types/operations";

const PAGE_SIZE = 20;
type ReasonAction = { type: "replay"; event: DeadLetter } | { type: "reconcile" };

function LoadingRows() {
  return (
    <div role="status" className="space-y-3 p-4 sm:p-5">
      <span className="sr-only">Đang tải dữ liệu vận hành</span>
      {Array.from({ length: 5 }, (_, index) => (
        <Skeleton key={index} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

function ReasonDialog({
  action,
  onClose,
  onSubmit,
}: {
  action: ReasonAction | null;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const title = action?.type === "replay" ? "Chạy lại sự kiện" : "Chạy đối soát thủ công";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = String(new FormData(event.currentTarget).get("reason") ?? "").trim();
    if (!reason || reason.length > 1000) {
      setError("Nhập lý do từ 1 đến 1.000 ký tự.");
      return;
    }
    try {
      await onSubmit(reason);
      onClose();
    } catch (caught) {
      setError(getOperationErrorMessage(caught instanceof Error ? caught : new Error(), "Không thể thực hiện thao tác."));
    }
  }

  return (
    <Dialog open={Boolean(action)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="rounded-2xl bg-white sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-slate-900">{title}</DialogTitle>
          <DialogDescription>Vui lòng ghi nhận lý do trước khi thực hiện thao tác.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="operation-reason" className="block font-medium text-slate-700">Lý do thực hiện</label>
            <Textarea id="operation-reason" name="reason" required maxLength={1000} rows={4} placeholder="Nhập lý do" />
          </div>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <DialogClose render={<Button type="button" variant="outline" />}>Hủy</DialogClose>
            <Button type="submit" className="bg-[#FF5E14] text-white hover:bg-[#E65310]">Xác nhận</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SandboxPayoutDialog() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const mutation = useResolveSandboxPayout();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payoutId = String(form.get("payoutId") ?? "").trim().toLowerCase();
    const reason = String(form.get("reason") ?? "").trim();
    const status = String(form.get("status") ?? "");
    if (!PAYMENT_ID_PATTERN.test(payoutId)) return setError("Mã payout phải là UUID hợp lệ.");
    if (!reason || reason.length > 500) return setError("Nhập lý do từ 1 đến 500 ký tự.");
    if ((status !== "succeeded" && status !== "failed") || form.get("confirm") !== "on") return setError("Hãy chọn kết quả và xác nhận đây là payout sandbox.");
    try {
      await mutation.mutateAsync({ payoutId, input: { status, reason, confirmSimulated: true } });
      toast.success("Đã xử lý payout sandbox");
      setOpen(false);
    } catch (caught) {
      setError(getOperationErrorMessage(caught instanceof Error ? caught : new Error(), "Không thể xử lý payout sandbox."));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !mutation.isPending && setOpen(nextOpen)}>
      <Button type="button" variant="outline" className="h-10" onClick={() => setOpen(true)}><Wrench data-icon="inline-start" /> Payout sandbox</Button>
      <DialogContent className="rounded-2xl bg-white sm:max-w-md" showCloseButton={false}>
        <DialogHeader><DialogTitle className="text-lg font-semibold text-slate-900">Xử lý payout sandbox</DialogTitle><DialogDescription>Chỉ dùng để mô phỏng kết quả payout trong môi trường sandbox.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5"><label htmlFor="payout-id" className="block font-medium text-slate-700">Mã payout</label><Input id="payout-id" name="payoutId" required placeholder="UUID payout" className="h-10" /></div>
          <div className="space-y-1.5"><label htmlFor="payout-status" className="block font-medium text-slate-700">Kết quả mô phỏng</label><select id="payout-status" name="status" defaultValue="succeeded" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"><option value="succeeded">Thành công</option><option value="failed">Thất bại</option></select></div>
          <div className="space-y-1.5"><label htmlFor="payout-reason" className="block font-medium text-slate-700">Lý do</label><Textarea id="payout-reason" name="reason" required maxLength={500} rows={3} placeholder="Nhập lý do" /></div>
          <label className="flex items-start gap-2 text-sm text-slate-600"><input name="confirm" type="checkbox" className="mt-0.5 accent-[#FF5E14]" /> Tôi xác nhận đây là payout sandbox.</label>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><DialogClose disabled={mutation.isPending} render={<Button type="button" variant="outline" />}>Hủy</DialogClose><Button type="submit" disabled={mutation.isPending} className="bg-[#FF5E14] text-white hover:bg-[#E65310]">{mutation.isPending ? "Đang xử lý..." : "Xác nhận"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DataSection({ title, description, loading, error, onRetry, empty, children }: { title: string; description: string; loading: boolean; error: string | null; onRetry: () => void; empty: boolean; children: ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-4 sm:p-5"><h2 className="text-base font-semibold text-slate-900">{title}</h2><p className="mt-1 text-xs text-slate-500">{description}</p></div>{loading ? <LoadingRows /> : error ? <div className="m-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-red-50 p-4 text-sm text-red-700 sm:m-5"><p role="alert">{error}</p><Button variant="outline" onClick={onRetry}>Thử lại</Button></div> : empty ? <div role="status" className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-slate-500"><Inbox size={30} strokeWidth={1.5} className="text-slate-400" />Chưa có dữ liệu.</div> : children}</section>;
}

function getVisiblePages(currentPage: number, totalPages: number) {
  if (totalPages <= 5) return Array.from({ length: totalPages }, (_, index) => index + 1);
  if (currentPage <= 3) return [1, 2, 3, "start", totalPages];
  if (currentPage >= totalPages - 2) return [1, "end", totalPages - 2, totalPages - 1, totalPages];
  return [1, "start", currentPage, "end", totalPages];
}

function Pagination({ page, totalPages, total, isFetching, onPrevious, onNext, onPageChange }: { page: number; totalPages?: number; total?: number; isFetching: boolean; onPrevious: () => void; onNext: () => void; onPageChange?: (page: number) => void }) {
  if (totalPages !== undefined && totalPages <= 1) return null;
  const pages = totalPages ? getVisiblePages(page, totalPages) : [];
  const changePage = (targetPage: number) => {
    if (onPageChange) return onPageChange(targetPage);
    if (targetPage < page) onPrevious();
    if (targetPage > page) onNext();
  };
  return <div className="border-t border-slate-100 px-3 py-4 sm:px-6"><div className="flex flex-col items-center justify-between gap-3 text-[13px] text-[#64748B] xl:flex-row"><div className="flex items-center gap-2"><span>{total !== undefined ? `· Tổng ${total} sự kiện` : `· Trang ${page}`}</span>{isFetching && <span>· Đang cập nhật...</span>}</div><nav aria-label="Phân trang" className="flex max-w-full flex-wrap items-center justify-center gap-1 sm:gap-2"><button type="button" disabled={page <= 1 || isFetching} onClick={() => changePage(page - 1)} className="inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"><ChevronLeft className="size-4" /><span className="hidden sm:inline">Previous</span></button>{pages.map((item) => typeof item === "number" ? <button key={item} type="button" disabled={isFetching} onClick={() => changePage(item)} aria-current={page === item ? "page" : undefined} className={`h-10 min-w-10 rounded-xl px-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${page === item ? "bg-[#FF5E14] text-white shadow-sm" : "bg-white text-slate-900 hover:bg-slate-100"}`}>{item}</button> : <span key={item} aria-hidden="true" className="flex h-9 min-w-5 items-center justify-center text-sm font-semibold text-slate-900 sm:h-10 sm:min-w-8">...</span>)}<button type="button" disabled={(totalPages !== undefined && page >= totalPages) || isFetching} onClick={() => changePage(page + 1)} className="inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"><span className="hidden sm:inline">Next</span><ChevronRight className="size-4" /></button></nav></div></div>;
}

export default function PaymentOperations() {
  const [deadPage, setDeadPage] = useState(1);
  const [reportPage, setReportPage] = useState(1);
  const [action, setAction] = useState<ReasonAction | null>(null);
  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const deadLetters = useDeadLettersQuery(deadPage, PAGE_SIZE);
  const reports = useReportsQuery(reportPage, PAGE_SIZE);
  const replay = useReplayDeadLetter();
  const reconcile = useReconcilePayments();
  const deadTotalPages = deadLetters.data ? Math.max(Math.ceil(deadLetters.data.total / PAGE_SIZE), 1) : undefined;
  const reportTotalPages = reports.data ? (reports.data.length < PAGE_SIZE ? reportPage : undefined) : undefined;

  async function submitAction(reason: string) {
    if (!action) return;
    if (action.type === "replay") { await replay.mutateAsync({ eventId: action.event.eventId, reason }); toast.success("Đã đưa sự kiện vào hàng đợi xử lý lại"); return; }
    const response = await reconcile.mutateAsync({ reason });
    setResult(response.payload.data);
    toast.success("Đã chạy đối soát thủ công");
  }

  const deadError = deadLetters.error ? getOperationErrorMessage(deadLetters.error, "Không thể tải danh sách sự kiện lỗi.") : null;
  const reportError = reports.error ? getOperationErrorMessage(reports.error, "Không thể tải báo cáo đối soát.") : null;

  return <div className="w-full min-w-0 space-y-5"><section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div><h2 className="text-base font-semibold text-slate-900">Vận hành thanh toán</h2><p className="mt-1 text-xs text-slate-500">Theo dõi sự kiện lỗi, đối soát dữ liệu và công cụ sandbox.</p></div><div className="flex flex-wrap gap-2"><SandboxPayoutDialog /><Button className="h-10 bg-[#FF5E14] text-white hover:bg-[#E65310]" onClick={() => setAction({ type: "reconcile" })}><RefreshCw data-icon="inline-start" /> Chạy đối soát</Button></div></section>{result && <section className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 sm:p-5"><h2 className="text-base font-semibold text-slate-900">Kết quả đối soát gần nhất</h2><div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2 text-sm text-slate-600 sm:grid-cols-3">{Object.entries(result).map(([key, value]) => <p key={key}><span>{key}: </span><span className="font-medium text-slate-900">{String(value)}</span></p>)}</div></section>}<DataSection title="Sự kiện cần xử lý" description="Sự kiện lỗi hoặc đang bị cách ly trong hàng đợi thanh toán." loading={deadLetters.isPending} error={deadError} onRetry={() => void deadLetters.refetch()} empty={!deadLetters.data?.items.length}><div className="overflow-x-auto"><table aria-label="Danh sách sự kiện cần xử lý" className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-slate-100 bg-slate-50/70 text-xs text-slate-900"><tr><th className="px-4 py-3.5 sm:px-5">Sự kiện</th><th className="px-3 py-3.5">Loại</th><th className="px-3 py-3.5">Lần thử</th><th className="px-3 py-3.5">Trạng thái</th><th className="px-3 py-3.5">Cập nhật</th><th className="px-4 py-3.5 text-right sm:px-5">Thao tác</th></tr></thead><tbody className="divide-y divide-slate-100">{deadLetters.data?.items.map((event) => { const status = DEAD_LETTER_STATUS[event.status as keyof typeof DEAD_LETTER_STATUS] ?? { label: event.status, color: "bg-slate-100 text-slate-600" }; return <tr key={event.eventId} className="hover:bg-slate-50/60"><td title={event.eventId} className="max-w-60 truncate px-4 py-4 font-medium text-slate-900 sm:px-5">{event.eventId}</td><td className="px-3 py-4 text-slate-600">{event.eventType}</td><td className="px-3 py-4 text-slate-600">{event.attempts}</td><td className="px-3 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status.color}`}>{status.label}</span></td><td className="whitespace-nowrap px-3 py-4 text-slate-600">{formatPaymentDate(event.updatedAt)}</td><td className="px-4 py-4 text-right sm:px-5">{event.status === "dead" ? <Button size="sm" variant="outline" onClick={() => setAction({ type: "replay", event })}><Play data-icon="inline-start" /> Chạy lại</Button> : "—"}</td></tr>; })}</tbody></table></div><Pagination page={deadPage} totalPages={deadTotalPages} total={deadLetters.data?.total} isFetching={deadLetters.isFetching} onPrevious={() => setDeadPage((page) => page - 1)} onNext={() => setDeadPage((page) => page + 1)} onPageChange={setDeadPage} /></DataSection><DataSection title="Báo cáo đối soát" description="Tổng hợp chênh lệch dữ liệu thanh toán theo ngày." loading={reports.isPending} error={reportError} onRetry={() => void reports.refetch()} empty={!reports.data?.length}><div className="overflow-x-auto"><table aria-label="Danh sách báo cáo đối soát" className="w-full min-w-[720px] text-left text-sm"><thead className="border-b border-slate-100 bg-slate-50/70 text-xs text-slate-900"><tr><th className="px-4 py-3.5 sm:px-5">Ngày báo cáo</th><th className="px-3 py-3.5">Chênh lệch</th><th className="px-3 py-3.5">Sự kiện lỗi</th><th className="px-3 py-3.5">Hoàn tiền cần xem xét</th><th className="px-4 py-3.5 sm:px-5">Tạo lúc</th></tr></thead><tbody className="divide-y divide-slate-100">{reports.data?.map((report) => <tr key={`${report.reportDate}-${report.generatedAt}`} className="hover:bg-slate-50/60"><td className="px-4 py-4 font-medium text-slate-900 sm:px-5">{report.reportDate}</td><td className="px-3 py-4 text-slate-600">{report.discrepancyCount}</td><td className="px-3 py-4 text-slate-600">{String(report.summary.deadEvents ?? "—")}</td><td className="px-3 py-4 text-slate-600">{String(report.summary.reviewRefunds ?? "—")}</td><td className="whitespace-nowrap px-4 py-4 text-slate-600 sm:px-5">{formatPaymentDate(report.generatedAt)}</td></tr>)}</tbody></table></div><Pagination page={reportPage} totalPages={reportTotalPages} isFetching={reports.isFetching} onPrevious={() => setReportPage((page) => page - 1)} onNext={() => setReportPage((page) => page + 1)} onPageChange={setReportPage} /></DataSection><ReasonDialog key={action ? `${action.type}-${action.type === "replay" ? action.event.eventId : "manual"}` : "closed"} action={action} onClose={() => setAction(null)} onSubmit={submitAction} /></div>;
}
