
"use client";

import React, { useState } from "react";
import {
  MoreHorizontal,
  Eye,
  Pencil,
  Power,
  Wrench,
  Trash2,
} from "lucide-react";
import { ServiceItem } from "../types";

interface ServiceCardProps {
  service: ServiceItem;
  onView: (service: ServiceItem) => void;
  onEdit: (service: ServiceItem) => void;
  onToggleStatus: (service: ServiceItem) => void;
  onDelete: (service: ServiceItem) => void;
}

export default function ServiceCard({
  service,
  onView,
  onEdit,
  onToggleStatus,
  onDelete,
}: ServiceCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="group relative rounded-2xl border border-slate-200 bg-white p-3 transition hover:border-orange-200 hover:shadow-md">
      <div className="absolute right-2 top-2 z-10">
        <button
          type="button"
          aria-label="Thao tác dịch vụ"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((prev) => !prev)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <MoreHorizontal size={19} />
        </button>

        {menuOpen && (
          <>
            <button
              type="button"
              aria-label="Đóng menu"
              className="fixed inset-0 z-10 cursor-default"
              onClick={() => setMenuOpen(false)}
            />

            <div className="absolute right-0 top-9 z-20 w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
              <MenuItem
                icon={<Eye size={15} />}
                onClick={() => {
                  setMenuOpen(false);
                  onView(service);
                }}
              >
                Xem chi tiết
              </MenuItem>

              <MenuItem
                icon={<Pencil size={15} />}
                onClick={() => {
                  setMenuOpen(false);
                  onEdit(service);
                }}
              >
                Chỉnh sửa
              </MenuItem>

              <MenuItem
                icon={<Power size={15} />}
                onClick={() => {
                  setMenuOpen(false);
                  onToggleStatus(service);
                }}
              >
                {service.isActive ? "Vô hiệu hóa" : "Kích hoạt"}
              </MenuItem>

              <MenuItem
                icon={<Trash2 size={15} />}
                onClick={() => {
                  setMenuOpen(false);
                  onDelete(service);
                }}
              >
                Xóa vĩnh viễn
              </MenuItem>
            </div>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={() => onView(service)}
        className="flex w-full flex-col items-center text-center"
      >
        <div className="mb-3 flex aspect-square w-full max-w-28 items-center justify-center overflow-hidden rounded-2xl border border-orange-100 bg-[#FFF9F5] transition group-hover:bg-orange-50">
          {service.iconUrl ? (
            <img
              src={service.iconUrl}
              alt={service.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <Wrench
              size={30}
              strokeWidth={1.6}
              className="text-[#FF5E14]"
            />
          )}
        </div>

        <h3 className="line-clamp-2 min-h-10 w-full text-sm font-bold text-slate-800 transition group-hover:text-[#FF5E14]">
          {service.name}
        </h3>
      </button>

      <div className="mt-2 flex justify-center">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${
            service.isActive
              ? "bg-emerald-50 text-emerald-700"
              : "bg-slate-100 text-slate-500"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              service.isActive ? "bg-emerald-500" : "bg-slate-400"
            }`}
          />
          {service.isActive ? "Active" : "Disabled"}
        </span>
      </div>
    </div>
  );
}

function MenuItem({
  icon,
  children,
  onClick,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-medium text-slate-600 transition hover:bg-orange-50 hover:text-[#FF5E14]"
    >
      {icon}
      {children}
    </button>
  );
}
