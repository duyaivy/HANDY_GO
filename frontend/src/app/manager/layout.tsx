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
  ChevronDown,
  ChevronRight,
  Search,
  Bell,
  Moon,
  Sun,
  Languages,
  Menu,
  X,
} from "lucide-react";
import AuthSession from "@/feature/auth/component/auth-session";
import authApiRequest from "@/feature/auth/api/auth.api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface ManageLayoutProps {
  children?: React.ReactNode;
}

export default function ManageLayout({ children }: ManageLayoutProps) {
  const router = useRouter();
  const currentPath = usePathname();

  const [isUsersOpen, setIsUsersOpen] = useState(true);
  const [isServicesOpen, setIsServicesOpen] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [hasNotifications, setHasNotifications] = useState(true);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setLogoutError("");

    try {
      await authApiRequest.logout();
      window.location.replace("/login");
    } catch (error) {
      console.error("[manager/logout]", error);
      setLogoutError("Không thể đăng xuất. Vui lòng thử lại.");
      setIsLoggingOut(false);
    }
  };

  const navigateTo = (path: string) => {
    setIsMobileMenuOpen(false);
    setIsProfileOpen(false);
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

  const menuClass = (active: boolean) =>
    `flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium transition-all ${
      active
        ? "bg-[#FF5E14] font-semibold text-white shadow-md shadow-orange-500/20"
        : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
    }`;

  const subMenuClass = (active: boolean) =>
    `flex w-full items-center gap-2 rounded-xl px-3.5 py-2 text-left text-sm transition-all ${
      active
        ? "bg-[#FF5E14] font-semibold text-white shadow-md shadow-orange-500/20"
        : "text-slate-400 hover:bg-slate-800/40 hover:text-white"
    }`;

  const sidebar = (
    <aside className="flex h-full w-64 shrink-0 flex-col justify-between border-r border-slate-800/80 bg-[#111827] text-slate-300">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="flex h-20 shrink-0 items-center justify-between gap-3 border-b border-slate-800/60 px-5 sm:px-6">
          <Image
            src="/handygo-logo-horizontal.svg"
            alt="HandyGo Logo"
            width={180}
            height={56}
            className="h-auto max-h-12 w-auto object-contain"
            priority
          />

          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(false)}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
            aria-label="Đóng menu"
          >
            <X size={21} />
          </button>
        </div>

        <nav className="flex-1 space-y-1.5 p-4">
          <button
            type="button"
            onClick={() => navigateTo("/manager/dashboard")}
            className={menuClass(activeItem === "dashboard")}
          >
            <LayoutDashboard size={17} />
            <span>Dashboard</span>
          </button>

          <div className="space-y-1">
            <button
              type="button"
              onClick={() => setIsUsersOpen(!isUsersOpen)}
              className={menuClass(false)}
            >
              <Users size={17} />
              <span className="flex-1">Người dùng</span>
              {isUsersOpen ? (
                <ChevronDown size={15} />
              ) : (
                <ChevronRight size={15} />
              )}
            </button>

            {isUsersOpen && (
              <div className="space-y-1 pl-6">
                <button
                  type="button"
                  onClick={() => navigateTo("/manager/customers")}
                  className={subMenuClass(activeItem === "customers")}
                >
                  <span>└</span>
                  <span>Khách hàng</span>
                </button>

                <button
                  type="button"
                  onClick={() => navigateTo("/manager/workers")}
                  className={subMenuClass(activeItem === "workers")}
                >
                  <span>└</span>
                  <span>Thợ</span>
                </button>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <button
              type="button"
              onClick={() => setIsServicesOpen(!isServicesOpen)}
              className={menuClass(false)}
            >
              <Layers size={17} />
              <span className="flex-1">Dịch vụ</span>
              {isServicesOpen ? (
                <ChevronDown size={15} />
              ) : (
                <ChevronRight size={15} />
              )}
            </button>

            {isServicesOpen && (
              <div className="space-y-1 pl-6">
                <button
                  type="button"
                  onClick={() =>
                    navigateTo("/manager/service-catalogs/Catalogs")
                  }
                  className={subMenuClass(
                    currentPath.includes("/service-catalogs/Catalogs"),
                  )}
                >
                  <span>└</span>
                  <span>Danh mục</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    navigateTo("/manager/service-catalogs/services")
                  }
                  className={subMenuClass(
                    currentPath.includes("/service-catalogs/services"),
                  )}
                >
                  <span>└</span>
                  <span>Dịch vụ</span>
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => navigateTo("/manager/orders")}
            className={menuClass(activeItem === "orders")}
          >
            <CalendarCheck size={17} />
            <span>Đơn hàng</span>
          </button>

          <button
            type="button"
            onClick={() => navigateTo("/manager/complainits")}
            className={menuClass(activeItem === "complainits")}
          >
            <AlertTriangle size={17} />
            <span>Khiếu nại</span>
          </button>

          <button
            type="button"
            onClick={() => navigateTo("/manager/reviews")}
            className={menuClass(activeItem === "reviews")}
          >
            <Star size={17} />
            <span>Đánh giá</span>
          </button>

          <button
            type="button"
            onClick={() => navigateTo("/manager/payments")}
            className={menuClass(activeItem === "payments")}
          >
            <CreditCard size={17} />
            <span>Thanh toán</span>
          </button>

          <button
            type="button"
            onClick={() => navigateTo("/manager/analytics")}
            className={menuClass(activeItem === "analytics")}
          >
            <BarChart3 size={17} />
            <span>Thống kê</span>
          </button>
        </nav>
      </div>

      <div className="shrink-0 space-y-1 border-t border-slate-800/80 p-4">
        <button
          type="button"
          onClick={() => navigateTo("/manager/setting")}
          className={menuClass(activeItem === "setting")}
        >
          <Settings size={17} />
          <span>Cài đặt</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setLogoutError("");
            setIsLogoutDialogOpen(true);
          }}
          disabled={isLoggingOut}
          className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium text-rose-400 transition-all hover:bg-rose-500/10 hover:text-rose-300"
        >
          <LogOut size={17} />
          <span>{isLoggingOut ? "Đang đăng xuất..." : "Đăng xuất"}</span>
        </button>
      </div>
    </aside>
  );

  return (
    <AuthSession>
      {(user) => {
        const accountLabel = user.email || user.phone || user.id;
        const avatarLabel = user.email
          ? user.email.slice(0, 2).toUpperCase()
          : (user.phone || user.id).slice(-2);
        const roleLabel = (user.roles ?? [])
          .map((role) =>
            role
              .replace(/^role[_-]?/i, "")
              .replace(/[_-]/g, " ")
              .toLowerCase()
              .replace(/\b\w/g, (letter) => letter.toUpperCase()),
          )
          .join(", ");
        return (
          <>
            <div className="flex min-h-screen w-full bg-[#F8FAFC] font-sans text-slate-800 selection:bg-[#FF5E14] selection:text-white">
              {/* SIDEBAR DESKTOP */}
              <div className="sticky top-0 hidden h-screen shrink-0 lg:block">
                {sidebar}
              </div>

              {/* SIDEBAR MOBILE */}
              {isMobileMenuOpen && (
                <div className="fixed inset-0 z-50 lg:hidden">
                  <button
                    type="button"
                    aria-label="Đóng menu"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="absolute inset-0 bg-slate-950/60 backdrop-blur-[2px]"
                  />

                  <div className="absolute inset-y-0 left-0 h-full shadow-2xl">
                    {sidebar}
                  </div>
                </div>
              )}

              {/* CỘT NỘI DUNG */}
              <div className="flex min-h-screen min-w-0 flex-1 flex-col">
                <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-orange-200/70 bg-[#FFF4EB] px-3 shadow-sm sm:h-[72px] sm:px-6 lg:px-8">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setIsMobileMenuOpen(true)}
                      className="shrink-0 rounded-xl border border-orange-200 bg-white p-2 text-slate-700 hover:text-[#FF5E14] lg:hidden"
                      aria-label="Mở menu"
                    >
                      <Menu size={20} />
                    </button>

                    <div className="relative w-full max-w-md">
                      <Search
                        size={17}
                        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                      <input
                        type="text"
                        placeholder="Tìm kiếm..."
                        className="w-full rounded-full border border-orange-200/80 bg-white py-2 pl-10 pr-3 text-sm text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 sm:py-2.5 sm:pr-4"
                      />
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
                    <button
                      type="button"
                      onClick={() => setHasNotifications(false)}
                      className="relative flex h-9 w-9 items-center justify-center rounded-full border border-orange-200/80 bg-white text-slate-700 hover:text-[#FF5E14] sm:h-10 sm:w-10"
                      title="Thông báo"
                    >
                      <Bell size={17} />
                      {hasNotifications && (
                        <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsDarkMode(!isDarkMode)}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-orange-200/80 bg-white text-slate-700 hover:text-[#FF5E14] sm:h-10 sm:w-10"
                      title={isDarkMode ? "Chế độ sáng" : "Chế độ tối"}
                    >
                      {isDarkMode ? (
                        <Sun size={17} className="text-amber-500" />
                      ) : (
                        <Moon size={17} />
                      )}
                    </button>

                    <button
                      type="button"
                      className="hidden h-10 w-10 items-center justify-center rounded-full border border-orange-200/80 bg-white text-slate-700 hover:text-[#FF5E14] sm:flex"
                      title="Đổi ngôn ngữ"
                    >
                      <Languages size={17} />
                    </button>

                    <div className="mx-1 hidden h-6 w-px bg-orange-200/80 sm:block" />

                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setIsProfileOpen(!isProfileOpen)}
                        className="flex items-center gap-2 rounded-full border border-orange-200/80 bg-white/80 p-1 pr-1.5 transition hover:bg-white sm:gap-2.5 sm:pr-2"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EA580C] text-xs font-bold text-white sm:h-9 sm:w-9">
                          {avatarLabel}
                        </span>
                        <span className="hidden text-sm font-semibold text-slate-800 md:inline">
                          {accountLabel}
                        </span>
                        <ChevronDown
                          size={15}
                          className={`hidden text-slate-400 transition-transform sm:block ${
                            isProfileOpen ? "rotate-180" : ""
                          }`}
                        />
                      </button>

                      {isProfileOpen && (
                        <>
                          <button
                            type="button"
                            aria-label="Đóng menu tài khoản"
                            onClick={() => setIsProfileOpen(false)}
                            className="fixed inset-0 z-40 cursor-default"
                          />

                          <div className="absolute right-0 top-full z-50 mt-2 w-52 rounded-2xl border border-slate-200 bg-white py-1.5 shadow-xl">
                            <div className="border-b border-slate-100 px-4 py-2.5">
                              <p className="text-xs font-semibold text-slate-400">
                                Tài khoản quản trị
                              </p>
                              <p className="text-sm font-bold text-slate-800">
                                {accountLabel}
                              </p>
                              <p className="text-[11px] font-medium text-emerald-600">
                                {roleLabel || "Tài khoản quản lý"}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => navigateTo("/manager/setting")}
                              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50"
                            >
                              <Settings size={16} />
                              Cài đặt hệ thống
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setLogoutError("");
                                setIsLogoutDialogOpen(true);
                              }}
                              disabled={isLoggingOut}
                              className="flex w-full items-center gap-2.5 border-t border-slate-100 px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50"
                            >
                              <LogOut size={16} />
                              {isLoggingOut ? "Đang đăng xuất..." : "Đăng xuất"}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </header>

                <main className="min-w-0 flex-1 overflow-x-hidden p-3 sm:p-5 lg:p-8">
                  <div className="mx-auto w-full max-w-[1600px] min-w-0">
                    {children}
                  </div>
                </main>
              </div>
            </div>
            <AlertDialog
              open={isLogoutDialogOpen}
              onOpenChange={(open) => {
                if (!isLoggingOut) {
                  setIsLogoutDialogOpen(open);
                  if (!open) setLogoutError("");
                }
              }}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Xác nhận đăng xuất</AlertDialogTitle>
                  <AlertDialogDescription>
                    Bạn có chắc chắn muốn đăng xuất khỏi hệ thống HandyGo không?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                {logoutError && (
                  <p role="alert" className="text-sm text-rose-600">
                    {logoutError}
                  </p>
                )}
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isLoggingOut}>
                    Hủy
                  </AlertDialogCancel>
                  <AlertDialogAction
                    disabled={isLoggingOut}
                    onClick={(event) => {
                      event.preventDefault();
                      void handleLogout();
                    }}
                    className="bg-red-600 text-white hover:bg-red-700"
                  >
                    {isLoggingOut ? "Đang đăng xuất..." : "Đăng xuất"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        );
      }}
    </AuthSession>
  );
}
