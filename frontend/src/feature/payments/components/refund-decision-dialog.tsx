import { useState, type FormEvent } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { useRefundDecision } from "../hooks/use-refunds";
import { getRefundErrorMessage } from "../refund-utils";
import type { Refund } from "../types/refund";

export default function RefundDecisionDialog({
  decision,
  onClose,
}: {
  decision: { refund: Refund; approve: boolean } | null;
  onClose: () => void;
}) {
  const [formError, setFormError] = useState("");
  const mutation = useRefundDecision();
  const approve = decision?.approve ?? false;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!decision || mutation.isPending) return;
    const reason = String(new FormData(event.currentTarget).get("reason") ?? "").trim();
    if (!reason || reason.length > 1000) {
      setFormError("Nhập lý do quyết định từ 1 đến 1.000 ký tự.");
      return;
    }
    setFormError("");
    mutation.reset();
    mutation.mutate(
      { refundId: decision.refund.id, input: { approve, reason } },
      {
        onSuccess: () => {
          toast.success(approve ? "Đã duyệt yêu cầu hoàn tiền" : "Đã từ chối yêu cầu hoàn tiền");
          onClose();
        },
      },
    );
  }

  const error = formError || (mutation.error && getRefundErrorMessage(mutation.error, "Không thể ghi nhận quyết định."));

  return (
    <Dialog open={Boolean(decision)} onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent className="rounded-2xl bg-white sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-slate-900">{approve ? "Duyệt yêu cầu hoàn tiền" : "Từ chối yêu cầu hoàn tiền"}</DialogTitle>
          <DialogDescription>{approve ? "Hệ thống sẽ tiếp tục xử lý hoàn tiền sau khi ghi nhận quyết định." : "Yêu cầu hoàn tiền sẽ được chuyển sang trạng thái từ chối."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="refund-decision-reason" className="block font-medium text-slate-700">Lý do quyết định</label>
            <Textarea id="refund-decision-reason" name="reason" required maxLength={1000} rows={4} placeholder="Nhập lý do" />
          </div>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <DialogClose disabled={mutation.isPending} render={<Button type="button" variant="outline" />}>Hủy</DialogClose>
            <Button type="submit" disabled={mutation.isPending} className={approve ? "bg-[#FF5E14] text-white hover:bg-[#E65310]" : "bg-slate-700 text-white hover:bg-slate-800"}>
              {mutation.isPending ? "Đang lưu..." : approve ? "Xác nhận duyệt" : "Xác nhận từ chối"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
