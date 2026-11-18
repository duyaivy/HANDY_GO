import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { usePaymentDetailQuery } from "../hooks/use-payments";
import {
  formatPaymentAmount,
  formatPaymentDate,
  getPaymentErrorMessage,
  PAYMENT_METHODS,
} from "../payment-utils";
import type { PaymentRecord } from "../types";
import PaymentStatusBadge from "./payment-status-badge";

function PaymentDetails({ payment }: { payment: PaymentRecord }) {
  const fields = [
    ["Mã giao dịch", payment.id],
    ["Mã đơn hàng", payment.orderId],
    ["Mã khách hàng", payment.customerUserId],
    ["Mã thợ", payment.workerUserId],
    ["Phí nền tảng", formatPaymentAmount(payment.platformFee, payment.currency)],
    ["Thu nhập của thợ", formatPaymentAmount(payment.workerEarning, payment.currency)],
    ["Ngày tạo", formatPaymentDate(payment.createdAt)],
    ["Cập nhật lần cuối", formatPaymentDate(payment.updatedAt)],
    ["Hoàn thành đơn hàng", formatPaymentDate(payment.orderCompletedAt)],
    ["Thời điểm thanh toán", formatPaymentDate(payment.paidAt)],
  ];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4">
        <div>
          <p className="text-xs text-slate-500">Số tiền giao dịch</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">
            {formatPaymentAmount(payment.amount, payment.currency)}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {payment.method ? PAYMENT_METHODS[payment.method] : "Chưa chọn phương thức"}
          </p>
        </div>
        <PaymentStatusBadge status={payment.status} />
      </div>
      <dl className="grid gap-4 sm:grid-cols-2">
        {fields.map(([label, value]) => (
          <div key={label} className="min-w-0 border-b border-slate-100 pb-3">
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="mt-1 break-all font-medium text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

export default function PaymentDetailModal({
  paymentId,
  onClose,
}: {
  paymentId: string | null;
  onClose: () => void;
}) {
  const detailQuery = usePaymentDetailQuery(paymentId);

  return (
    <Dialog open={Boolean(paymentId)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl bg-white sm:max-w-2xl"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-slate-900">
            Chi tiết giao dịch
          </DialogTitle>
          <DialogDescription className="sr-only">
            Thông tin thanh toán và các bên liên quan
          </DialogDescription>
        </DialogHeader>
        {detailQuery.isPending && paymentId && (
          <div className="space-y-3" role="status">
            <span className="sr-only">Đang tải chi tiết giao dịch</span>
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        )}
        {detailQuery.isError && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-red-50 p-4 text-red-700">
            <p role="alert">{getPaymentErrorMessage(detailQuery.error, "Không thể tải chi tiết giao dịch.")}</p>
            <Button variant="outline" onClick={() => void detailQuery.refetch()} disabled={detailQuery.isFetching}>
              Thử lại
            </Button>
          </div>
        )}
        {detailQuery.data && !detailQuery.isError && <PaymentDetails payment={detailQuery.data} />}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Đóng</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
