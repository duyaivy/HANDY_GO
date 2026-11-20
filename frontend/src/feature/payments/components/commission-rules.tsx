"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { HttpError } from "@/shared/api/http";
import { useCommissionRulesQuery } from "../hooks/use-commission-rules";
import { formatPaymentDate } from "../payment-utils";
import CreateCommissionRuleDialog from "./create-commission-rule-dialog";

const PAGE_SIZE = 20;
const rateFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

export default function CommissionRules() {
  const [page, setPage] = useState(1);
  const rulesQuery = useCommissionRulesQuery({ page, limit: PAGE_SIZE });
  const { data, error, isFetching, isPending } = rulesQuery;
  const noAccess = error instanceof HttpError && error.status === 403;
  const totalPages = data?.totalPages ?? 0;

  return (
    <section aria-labelledby="commission-rules-title" className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 sm:p-5">
        <div>
          <h2 id="commission-rules-title" className="text-base font-semibold">Quy tắc hoa hồng</h2>
          {data && !error && (
            <p className="mt-1 text-xs text-slate-500" aria-live="polite">
              Tổng cộng {data.total} quy tắc
            </p>
          )}
        </div>
        <CreateCommissionRuleDialog disabled={noAccess} onCreated={() => setPage(1)} />
      </div>

      {error ? (
        <div className="m-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-red-50 p-4 text-sm text-red-700">
          <p role="alert">{noAccess ? "Bạn không có quyền quản lý quy tắc hoa hồng." : "Không thể tải quy tắc hoa hồng."}</p>
          {!noAccess && (
            <Button variant="outline" disabled={isFetching} onClick={() => void rulesQuery.refetch()}>
              Thử lại
            </Button>
          )}
        </div>
      ) : isPending ? (
        <div role="status" className="space-y-3 p-4 sm:p-5">
          <span className="sr-only">Đang tải quy tắc hoa hồng</span>
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <div role="status" className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-slate-500">
          <Inbox size={30} strokeWidth={1.5} className="text-slate-400" />
          Chưa có quy tắc hoa hồng.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table aria-label="Danh sách quy tắc hoa hồng" className="w-full min-w-[580px] text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/70 text-xs text-slate-900">
              <tr>
                <th scope="col" className="whitespace-nowrap px-4 py-3.5 sm:px-5">Tỷ lệ</th>
                <th scope="col" className="whitespace-nowrap px-3 py-3.5">Hiệu lực từ</th>
                <th scope="col" className="whitespace-nowrap px-3 py-3.5">Hiệu lực đến</th>
                <th scope="col" className="w-2/5 px-4 py-3.5 sm:px-5">Mô tả</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((rule) => (
                <tr key={rule.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-4 font-semibold sm:px-5">{rateFormatter.format(Number(rule.ratePercent))}%</td>
                  <td className="whitespace-nowrap px-3 py-4 text-slate-600">{formatPaymentDate(rule.effectiveFrom)}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-slate-600">{rule.effectiveTo ? formatPaymentDate(rule.effectiveTo) : "Chưa ấn định"}</td>
                  <td className="px-4 py-4 [overflow-wrap:anywhere] text-slate-600 sm:px-5">{rule.description || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && !error && totalPages > 1 && (
        <nav aria-label="Phân trang quy tắc hoa hồng" className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 sm:px-5">
          <p className="text-sm text-slate-500">Trang {data.page} / {totalPages}</p>
          <div className="flex gap-2">
            <Button variant="outline" disabled={page <= 1 || isFetching} onClick={() => setPage(page - 1)}>
              <ChevronLeft data-icon="inline-start" /> Trang trước
            </Button>
            <Button variant="outline" disabled={page >= totalPages || isFetching} onClick={() => setPage(page + 1)}>
              Trang sau <ChevronRight data-icon="inline-end" />
            </Button>
          </div>
        </nav>
      )}
    </section>
  );
}
