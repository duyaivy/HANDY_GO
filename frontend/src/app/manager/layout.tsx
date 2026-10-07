"use client";

import { usePathname, useRouter } from "next/navigation";
import React, { useState } from "react";
import Image from "next/image";
import {
  LayoutDashboard,
  Users,
  Layers,
  CalendarCheck,
  AlertTriangle,
  Star,
  CreditCard,
  BarChart3,
  Settings,
  LogOut,
  Zap,
  ChevronDown,
  ChevronRight,
  Search,
  Bell,
  Moon,
  Sun,
  Languages,
} from "lucide-react";

export interface ManageLayoutProps {
  children?: React.ReactNode;
}

export default function ManageLayout({ children }: ManageLayoutProps) {
  const router = useRouter();
  const currentPath = usePathname();

  const navigateTo = (path: string) => {
    router.push(path);
  };

  const getActiveItem = () => {
    if (currentPath.includes("/customers")) return "customers";
    if (currentPath.includes("/workers")) return "workers";
    if (currentPath.includes("/worker-applications"))
      return "worker-applications";
    if (currentPath.includes("/service-catalogs")) return "service-catalogs";
    if (currentPath.includes("/orders")) return "orders";
    if (currentPath.includes("/complainits")) return "complainits";
    if (currentPath.includes("/reviews")) return "reviews";
    if (currentPath.includes("/payments")) return "payments";
    if (currentPath.includes("/analytics")) return "analytics";
    if (currentPath.includes("/setting")) return "setting";
    return "dashboard";
  };

  const activeItem = getActiveItem();

  const [isUsersOpen, setIsUsersOpen] = useState(true);
  const [isServicesOpen, setIsServicesOpen] = useState(true);

  const [isDarkMode, setIsDarkMode] = useState(false);
  const [hasNotifications, setHasNotifications] = useState(true);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  return (
    <div className="min-h-screen w-full flex bg-[#F8FAFC] text-slate-800 font-sans selection:bg-[#FF5E14] selection:text-white">
      <aside className="w-64 bg-[#111827] text-slate-300 flex flex-col justify-between shrink-0 h-screen sticky top-0 select-none z-30 border-r border-slate-800/80">
        <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
          {/* LOGO HEADER */}
          <div className="h-20 flex items-center px-6 gap-3 border-b border-slate-800/60 shrink-0">
            <Image
              src="/handygo-logo-horizontal.svg"
              alt="HandyGo Logo"
              width={180}
              height={56}
              className="h-30 w-auto object-contain"
              priority
            />

            {/* <div className="flex flex-col">
              <span className="text-xl font-black text-white tracking-wider">
                LOGO
              </span>
            </div> */}
          </div>

          {/* DANH SÁCH MENU */}
          <nav className="p-4 space-y-1.5 flex-1">
            {/* 1. Dashboard */}
            <button
              type="button"
              onClick={() => navigateTo("/manager/dashboard")}
              className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                activeItem === "dashboard"
                  ? "bg-[#FF5E14] text-white font-semibold shadow-md shadow-orange-500/20"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <LayoutDashboard className="w-4 h-4 shrink-0" />
              <span>Dashboard</span>
            </button>

            {/* 2. Người dùng */}
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setIsUsersOpen(!isUsersOpen)}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800/60 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-3.5">
                  <Users className="w-4 h-4 shrink-0" />
                  <span>Người dùng</span>
                </div>

                {isUsersOpen ? (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                )}
              </button>

              {isUsersOpen && (
                <div className="pl-6 space-y-1 text-sm">
                  {/* Khách hàng */}
                  <button
                    type="button"
                    onClick={() => navigateTo("/manager/customers")}
                    className={`w-full flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm transition-all cursor-pointer ${
                      activeItem === "customers"
                        ? "bg-[#FF5E14] text-white font-semibold shadow-md shadow-orange-500/20"
                        : "text-slate-400 hover:text-white hover:bg-slate-800/40"
                    }`}
                  >
                    <span className="text-slate-500 text-xs">└</span>
                    <span>Khách hàng</span>
                  </button>

                  {/* Thợ */}
                  <button
                    type="button"
                    onClick={() => navigateTo("/manager/workers")}
                    className={`w-full flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm transition-all cursor-pointer ${
                      activeItem === "workers"
                        ? "bg-[#FF5E14] text-white font-semibold shadow-md shadow-orange-500/20"
                        : "text-slate-400 hover:text-white hover:bg-slate-800/40"
                    }`}
                  >
                    <span
                      className={
                        activeItem === "workers"
                          ? "text-white/80 text-xs"
                          : "text-slate-500 text-xs"
                      }
                    >
                      └
                    </span>

                    <span>Thợ</span>
                  </button>
                </div>
              )}
            </div>

            {/* 3. Dịch vụ */}
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setIsServicesOpen(!isServicesOpen)}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800/60 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-3.5">
                  <Layers className="w-4 h-4 shrink-0" />
                  <span>Dịch vụ</span>
                </div>

                {isServicesOpen ? (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                )}
              </button>

              {isServicesOpen && (
                <div className="pl-6 space-y-1 text-sm">
                  {/* Danh mục */}
                  <button
                    type="button"
                    onClick={() =>
                      navigateTo("/manager/service-catalogs/Catalogs")
                    }
                    className={`w-full flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm transition-all cursor-pointer ${
                      currentPath.includes("/service-catalogs/Catalogs")
                        ? "bg-[#FF5E14] text-white font-semibold shadow-md shadow-orange-500/20"
                        : "text-slate-400 hover:text-white hover:bg-slate-800/40"
                    }`}
                  >
                    <span className="text-slate-500 text-xs">└</span>
                    <span>Danh mục</span>
                  </button>

                  {/* Dịch vụ */}
                  <button
                    type="button"
                    onClick={() =>
                      navigateTo("/manager/service-catalogs/services")
                    }
                    className={`w-full flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm transition-all cursor-pointer ${
                      currentPath.includes("/service-catalogs/services")
                        ? "bg-[#FF5E14] text-white font-semibold shadow-md shadow-orange-500/20"
                        : "text-slate-400 hover:text-white hover:bg-slate-800/40"
                    }`}
                  >
                    <span className="text-slate-500 text-xs">└</span>
                    <span>Dịch vụ</span>
                  </button>
                </div>
              )}
            </div>

            {/* 4. Đơn hàng */}
            <button
              type="button"
              onClick={() => navigateTo("/manager/orders")}
              className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                activeItem === "orders"
                  ? "bg-[#FF5E14] text-white font-semibold shadow-md shadow-orange-500/20"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <CalendarCheck className="w-4 h-4 shrink-0" />
              <span>Đơn hàng</span>
            </button>

            {/* 5. Khiếu nại */}
            <button
              type="button"
              onClick={() => navigateTo("/manager/complainits")}
              className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                activeItem === "complainits"
                  ? "bg-[#FF5E14] text-white font-semibold shadow-md shadow-orange-500/20"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Khiếu nại</span>
            </button>

            {/* 6. Đánh giá */}
            <button
              type="button"
              onClick={() => navigateTo("/manager/reviews")}
              className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                activeItem === "reviews"
                  ? "bg-[#FF5E14] text-white font-semibold shadow-md shadow-orange-500/20"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <Star className="w-4 h-4 shrink-0" />
              <span>Đánh giá</span>
            </button>

            {/* 7. Thanh toán */}
            <button
              type="button"
              onClick={() => navigateTo("/manager/payments")}
              className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                activeItem === "payments"
                  ? "bg-[#FF5E14] text-white font-semibold shadow-md shadow-orange-500/20"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <CreditCard className="w-4 h-4 shrink-0" />
              <span>Thanh toán</span>
            </button>

            {/* 8. Thống kê */}
            <button
              type="button"
              onClick={() => navigateTo("/manager/analytics")}
              className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                activeItem === "analytics"
                  ? "bg-[#FF5E14] text-white font-semibold shadow-md shadow-orange-500/20"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <BarChart3 className="w-4 h-4 shrink-0" />
              <span>Thống kê</span>
            </button>
          </nav>
        </div>

        {/* CHÂN SIDEBAR */}
        <div className="p-4 border-t border-slate-800/80 space-y-1 shrink-0">
          {/* Cài đặt */}
          <button
            type="button"
            onClick={() => navigateTo("/manager/setting")}
            className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
              activeItem === "setting"
                ? "bg-[#FF5E14] text-white font-semibold shadow-md shadow-orange-500/20"
                : "text-slate-400 hover:text-white hover:bg-slate-800/60"
            }`}
          >
            <Settings className="w-4 h-4 shrink-0" />
            <span>Cài đặt</span>
          </button>

          {/* Đăng xuất */}
          <button
            type="button"
            onClick={() => {
              window.location.href = "/";
            }}
            className="w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>Đăng xuất</span>
          </button>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* 2. CỘT PHẢI: HEADER & CONTENT */}
      {/* ========================================================================= */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        <header className="h-16 sm:h-18 bg-[#FFF4EB] border-b border-orange-200/70 px-6 lg:px-8 flex items-center justify-between sticky top-0 z-20 shrink-0 shadow-2xs">
          {/* Ô tìm kiếm */}
          <div className="flex items-center flex-1 max-w-md">
            <div className="relative w-full">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <Search className="w-4 h-4" />
              </div>

              <input
                type="text"
                placeholder="Search..."
                className="w-full pl-10 pr-4 py-2 sm:py-2.5 rounded-full border border-orange-200/80 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-orange-500 focus:ring-3 focus:ring-orange-500/15 transition-all shadow-2xs"
              />
            </div>
          </div>

          {/* Header actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Chuông */}
            <button
              type="button"
              onClick={() => setHasNotifications(false)}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full border border-orange-200/80 bg-white hover:bg-orange-50/60 flex items-center justify-center text-slate-700 hover:text-[#FF5E14] transition-all cursor-pointer relative shadow-2xs"
              title="Thông báo"
            >
              <Bell className="w-4 h-4 sm:w-4.5 sm:h-4.5" />

              {hasNotifications && (
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-white absolute top-2 right-2 animate-pulse" />
              )}
            </button>

            {/* Sáng / Tối */}
            <button
              type="button"
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full border border-orange-200/80 bg-white hover:bg-orange-50/60 flex items-center justify-center text-slate-700 hover:text-[#FF5E14] transition-all cursor-pointer shadow-2xs"
              title={isDarkMode ? "Chế độ sáng" : "Chế độ tối"}
            >
              {isDarkMode ? (
                <Sun className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-amber-500" />
              ) : (
                <Moon className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
              )}
            </button>

            {/* Ngôn ngữ */}
            <button
              type="button"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full border border-orange-200/80 bg-white hover:bg-orange-50/60 flex items-center justify-center text-slate-700 hover:text-[#FF5E14] transition-all cursor-pointer shadow-2xs"
              title="Đổi ngôn ngữ"
            >
              <Languages className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            </button>

            <div className="h-6 w-px bg-orange-200/80 mx-1 sm:mx-2" />

            {/* Admin Profile Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="flex items-center gap-2 sm:gap-2.5 p-1 pr-2 rounded-full bg-white/70 hover:bg-white border border-orange-200/80 transition-all cursor-pointer select-none shadow-2xs"
              >
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#EA580C] text-white font-bold text-xs sm:text-sm flex items-center justify-center shadow-xs shrink-0">
                  AD
                </div>

                <span className="text-sm font-semibold text-slate-800 hidden md:inline">
                  Admin
                </span>

                <ChevronDown
                  className={`w-4 h-4 text-slate-400 transition-transform ${
                    isProfileOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {isProfileOpen && (
                <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl shadow-xl border border-slate-150 py-1.5 z-50">
                  <div className="px-4 py-2.5 border-b border-slate-100">
                    <p className="text-xs font-semibold text-slate-400">
                      Tài khoản quản trị
                    </p>

                    <p className="text-sm font-bold text-slate-800">Admin</p>

                    <p className="text-[11px] text-emerald-600 font-medium">
                      System manager
                    </p>
                  </div>

                  <div className="py-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsProfileOpen(false);
                        navigateTo("/manager/setting");
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-xs sm:text-sm text-slate-600 hover:bg-slate-50 transition-colors text-left cursor-pointer"
                    >
                      <Settings className="w-4 h-4 text-slate-400" />
                      <span>Cài đặt hệ thống</span>
                    </button>
                  </div>

                  <div className="border-t border-slate-100 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        window.location.href = "/";
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-xs sm:text-sm text-rose-600 hover:bg-rose-50 transition-colors text-left cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Đăng xuất</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* CONTENT */}
        <main className="flex-1 p-6 lg:p-8 overflow-y-auto">
          <div className="max-w-[1600px] mx-auto w-full">{children}</div>
        </main>
      </div>
    </div>
  );
}
