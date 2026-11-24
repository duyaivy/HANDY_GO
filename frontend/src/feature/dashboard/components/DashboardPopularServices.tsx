"use client";

import React from "react";
import { ArrowUpRight, Layers3, Wrench } from "lucide-react";

import type { TopService } from "../types/dashboard";

interface DashboardPopularServicesProps {
  data: TopService[];
  onViewAll?: () => void;
}

const formatNumber = (value: number) =>
  new Intl.NumberFormat("vi-VN").format(value);

export const DashboardPopularServices: React.FC<
  DashboardPopularServicesProps
> = ({ data, onViewAll }) => {
  const services = [...data]
    .sort((a, b) => b.completedOrderCount - a.completedOrderCount)
    .slice(0, 5);

  const maxOrders = Math.max(
    1,
    ...services.map((service) => service.completedOrderCount),
  );

  return (
    <section className="flex h-full min-w-0 flex-col rounded-[22px] border border-slate-200/90 bg-white p-5 shadow-[0_3px_16px_rgba(15,23,42,0.035)] sm:p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50">
            <Layers3 className="h-5 w-5 text-[#FF5E14]" strokeWidth={1.8} />
          </div>

          <div>
            <h2 className="text-base font-bold tracking-tight text-slate-950">
              Dịch vụ phổ biến
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Theo số đơn hoàn thành
            </p>
          </div>
        </div>

        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#FF5E14] transition-colors hover:text-[#E65310]"
          >
            Xem tất cả
            <ArrowUpRight className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Danh sách dịch vụ */}
      {services.length > 0 ? (
        <ul className="mt-5 divide-y divide-slate-100">
          {services.map((service) => {
            const percentage = (service.completedOrderCount / maxOrders) * 100;

            return (
              <li
                key={service.serviceId}
                className="flex items-center gap-3 py-3.5 first:pt-1 last:pb-0"
              >
                {/* Avatar dịch vụ */}
                <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
                  {service.iconUrl ? (
                    <img
                      src={service.iconUrl}
                      alt={service.name}
                      className="block h-full w-full object-cover object-center"
                      loading="lazy"
                    />
                  ) : (
                    <Wrench
                      className="h-6 w-6 text-slate-400"
                      strokeWidth={1.7}
                    />
                  )}
                </div>

                {/* Tên dịch vụ và tiến độ */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p
                      className="min-w-0 truncate text-sm font-semibold text-slate-900"
                      title={service.name}
                    >
                      {service.name}
                    </p>

                    {/* Số đơn */}
                    <div className="shrink-0 whitespace-nowrap text-right">
                      <span className="text-sm font-bold text-slate-900">
                        {formatNumber(service.completedOrderCount)}
                      </span>
                      <span className="ml-1 text-xs font-normal text-slate-400">
                        đơn
                      </span>
                    </div>
                  </div>

                  {/* Thanh tiến độ */}
                  <div
                    className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-100"
                    role="progressbar"
                    aria-label={`Số đơn hoàn thành của ${service.name} so với dịch vụ đứng đầu`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(percentage)}
                  >
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#FF8B42] to-[#FF5E14] transition-all duration-500"
                      style={{
                        width: `${percentage}%`,
                      }}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex min-h-[230px] flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-50">
            <Layers3 className="h-6 w-6 text-slate-400" />
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700">
              Chưa có dữ liệu dịch vụ
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Không có đơn hàng hoàn thành trong khoảng thời gian này.
            </p>
          </div>
        </div>
      )}
    </section>
  );
};

export default DashboardPopularServices;
