import { useRef, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCreateRefund } from "../hooks/use-refunds";
import { getRefundErrorMessage } from "../refund-utils";

function createIdempotencyKey() {
  return crypto.randomUUID();
}

export default function CreateRefundDialog({
  paymentId,
  disabled,
}: {
  paymentId: string;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const idempotencyKey = useRef("");
  const mutation = useCreateRefund();

  function changeOpen(nextOpen: boolean) {
    if (mutation.isPending) return;
    if (nextOpen) idempotencyKey.current = createIdempotencyKey();
    setFormError("");
    mutation.reset();
    setOpen(nextOpen);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;

    const form = new FormData(event.currentTarget);
    const amount = String(form.get("amount") ?? "").trim();
    const reason = String(form.get("reason") ?? "").trim();
    setFormError("");
    mutation.reset();

    if (!/^[1-9]\d{0,18}$/.test(amount)) {
      setFormError("Nhập số tiền hoàn là số VND nguyên lớn hơn 0.");
      return;
    }
    if (!reason || reason.length > 1000) {
      setFormError("Nhập lý do hoàn tiền từ 1 đến 1.000 ký tự.");
      return;
    }

    mutation.mutate(
      { paymentId, input: { amount, reason, idempotencyKey: idempotencyKey.current } },
      {
        onSuccess: () => {
          toast.success("Đã tạo yêu cầu hoàn tiền");
          changeOpen(false);
        },
      },
    );
  }

  const error = formError || (mutation.error && getRefundErrorMessage(mutation.error, "Không thể tạo yêu cầu hoàn tiền."));

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger
        disabled={disabled}
        render={<Button className="h-10 rounded-lg bg-[#FF5E14] px-4 text-white hover:bg-[#E65310]" />}
      >
        <Plus data-icon="inline-start" /> Tạo yêu cầu
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl bg-white sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-slate-900">Tạo yêu cầu hoàn tiền</DialogTitle>
          <DialogDescription>Yêu cầu mới sẽ được đưa vào trạng thái chờ duyệt.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="refund-amount" className="block font-medium text-slate-700">Số tiền hoàn (VND)</label>
            <Input id="refund-amount" name="amount" inputMode="numeric" required placeholder="Ví dụ 50000" className="h-10" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="refund-reason" className="block font-medium text-slate-700">Lý do hoàn tiền</label>
            <Textarea id="refund-reason" name="reason" required maxLength={1000} rows={4} placeholder="Nhập lý do hoàn tiền" />
          </div>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <DialogClose disabled={mutation.isPending} render={<Button type="button" variant="outline" />}>Hủy</DialogClose>
            <Button type="submit" disabled={mutation.isPending} className="bg-[#FF5E14] text-white hover:bg-[#E65310]">
              {mutation.isPending ? "Đang tạo..." : "Tạo yêu cầu"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
