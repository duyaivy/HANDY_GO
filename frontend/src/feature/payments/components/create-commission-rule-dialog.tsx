
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
import { HttpError } from "@/shared/api/http";
import { useCreateCommissionRule } from "../hooks/use-commission-rules";

function getCreateError(error: Error) {
  if (error instanceof HttpError) {
    if (error.status === 403) {
      return "Bạn không có quyền tạo quy tắc.";
    }

    if (error.status === 409) {
      return "Thời gian đã có quy tắc khác. Vui lòng chọn thời điểm muộn hơn.";
    }
  }

  return "Không thể tạo quy tắc. Vui lòng thử lại.";
}

type Props = {
  disabled: boolean;
  onCreated: () => void;
};

export default function CreateCommissionRuleDialog({
  disabled,
  onCreated,
}: Props) {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const submittingRef = useRef(false);

  const createMutation = useCreateCommissionRule();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (createMutation.isPending || submittingRef.current) return;

    const form = new FormData(event.currentTarget);

    const ratePercent = String(
      form.get("ratePercent") ?? "",
    )
      .trim()
      .replace(",", ".");

    const localDate = String(
      form.get("effectiveFrom") ?? "",
    );

    const effectiveFrom = new Date(
      `${localDate}:00+07:00`,
    );

    const description = String(
      form.get("description") ?? "",
    ).trim();

    setFormError("");
    createMutation.reset();

    if (
      !/^\d{1,3}(\.\d{1,2})?$/.test(ratePercent) ||
      Number(ratePercent) > 30
    ) {
      setFormError(
        "Tỷ lệ phải từ 0% đến 30%, tối đa 2 chữ số thập phân.",
      );
      return;
    }

    if (
      !Number.isFinite(effectiveFrom.getTime()) ||
      effectiveFrom.getTime() <= Date.now()
    ) {
      setFormError("Vui lòng chọn thời gian trong tương lai.");
      return;
    }

    submittingRef.current = true;
    createMutation.mutate(
      {
        ratePercent,
        effectiveFrom: effectiveFrom.toISOString(),
        description: description || undefined,
      },
      {
        onSuccess: () => {
          onCreated();
          setOpen(false);
          toast.success("Tạo quy tắc thành công");
        },
        onSettled: () => {
          submittingRef.current = false;
        },
      },
    );
  }

  const error =
    formError ||
    (createMutation.error &&
      getCreateError(createMutation.error));

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (createMutation.isPending) return;

        setFormError("");
        createMutation.reset();
        setOpen(nextOpen);
      }}
    >
      <DialogTrigger
        disabled={disabled}
        render={
          <Button className="h-10 rounded-lg bg-[#FF5E14] px-4 font-medium text-white hover:bg-[#E65310]" />
        }
      >
        <Plus data-icon="inline-start" />
        Thêm quy tắc
      </DialogTrigger>

      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-xl sm:max-w-[440px]"
      >
        <DialogHeader className="space-y-1 px-6 pt-6">
          <DialogTitle className="text-lg font-semibold tracking-tight text-slate-900">
            Thêm quy tắc hoa hồng
          </DialogTitle>

          <DialogDescription className="text-sm text-slate-500">
            Thiết lập tỷ lệ áp dụng cho giao dịch.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit}>
          <div className="space-y-5 px-6 py-6">
            {/* Tỷ lệ hoa hồng */}
            <div className="space-y-2">
              <label
                htmlFor="commission-rate"
                className="text-sm font-medium text-slate-700"
              >
                Tỷ lệ hoa hồng
              </label>

              <div className="relative">
                <Input
                  id="commission-rate"
                  name="ratePercent"
                  inputMode="decimal"
                  autoComplete="off"
                  required
                  placeholder="Ví dụ: 10,5"
                  className="h-11 rounded-xl border-slate-200 pr-10 focus-visible:border-[#FF5E14] focus-visible:ring-[#FF5E14]/15"
                />

                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-medium text-slate-400">
                  %
                </span>
              </div>

              <p className="text-xs text-slate-400">
                Tối đa 30%
              </p>
            </div>

            {/* Ngày hiệu lực */}
            <div className="space-y-2">
              <label
                htmlFor="commission-effective-from"
                className="text-sm font-medium text-slate-700"
              >
                Ngày bắt đầu
              </label>

              <Input
                id="commission-effective-from"
                name="effectiveFrom"
                type="datetime-local"
                required
                className="h-11 rounded-xl border-slate-200 focus-visible:border-[#FF5E14] focus-visible:ring-[#FF5E14]/15"
              />
            </div>

            {/* Mô tả */}
            <div className="space-y-2">
              <label
                htmlFor="commission-description"
                className="text-sm font-medium text-slate-700"
              >
                Mô tả{" "}
                <span className="font-normal text-slate-400">
                  (tùy chọn)
                </span>
              </label>

              <Textarea
                id="commission-description"
                name="description"
                maxLength={500}
                rows={2}
                placeholder="Nhập mô tả ngắn..."
                className="min-h-20 resize-none rounded-xl border-slate-200 focus-visible:border-[#FF5E14] focus-visible:ring-[#FF5E14]/15"
              />
            </div>

            {/* Thông báo lỗi */}
            {error && (
              <p
                role="alert"
                className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600"
              >
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
            <DialogClose
              disabled={createMutation.isPending}
              render={
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-lg border-slate-200 px-4"
                />
              }
            >
              Hủy
            </DialogClose>

            <Button
              type="submit"
              disabled={createMutation.isPending}
              className="h-10 rounded-lg bg-[#FF5E14] px-4 font-medium text-white hover:bg-[#E65310]"
            >
              {createMutation.isPending
                ? "Đang lưu..."
                : "Tạo quy tắc"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
