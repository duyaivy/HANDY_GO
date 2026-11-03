"use client";

import React, { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Menu, X, Home, Compass, PhoneCall } from "lucide-react";

import type { ViewMode } from "../types";

export interface CategoryServiceNavbarProps {
  currentView: ViewMode;
  onSelectView: (view: ViewMode) => void;
  onNavigateHome: () => void;
  onOpenSupport?: () => void;
}

export const CategoryServiceNavbar: React.FC<CategoryServiceNavbarProps> = ({
  currentView,
  onSelectView,
  onNavigateHome,
  onOpenSupport,
}) => {
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleNavigateHome = () => {
    setIsMobileMenuOpen(false);
    onNavigateHome();
  };

  const handleNavigateServices = () => {
    setIsMobileMenuOpen(false);

    if (currentView === "discovery") {
      onSelectView("discovery");
    } else {
      router.push("/services");
    }
  };

  const handleOpenSupport = () => {
    setIsMobileMenuOpen(false);
    onOpenSupport?.();
  };

  const handleDownloadApp = () => {
    setIsMobileMenuOpen(false);

    const downloadSection = document.getElementById("download-app");

    if (downloadSection) {
      downloadSection.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    } else {
      router.push("/services#download-app");
    }
  };

  return (
    <header className="sticky inset-x-0 top-0 z-50 w-full border-b border-slate-100 bg-white/95 shadow-sm backdrop-blur-md">
      <div className="relative mx-auto max-w-[1600px] px-4 sm:px-6 xl:px-8">
        <div className="flex h-[72px] items-center justify-between gap-5 sm:h-[88px]">
          {/* LOGO: luôn hiển thị */}
          <button
            type="button"
            onClick={handleNavigateHome}
            className="flex shrink-0 items-center"
            aria-label="Về trang chủ HandyGo"
          >
            <Image
              src="/handygo.svg"
              alt="HandyGo"
              width={270}
              height={90}
              priority
              className="h-auto w-[160px] object-contain md:w-[135px] lg:w-[180px] xl:w-[210px]"
            />
          </button>

          {/* DESKTOP MENU */}
          <nav className="hidden min-w-0 items-center justify-center gap-0 md:flex lg:gap-1 2xl:gap-1.5">
            <button
              type="button"
              onClick={handleNavigateHome}
              className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-1.5 py-3 text-[12px] font-extrabold lg:px-3 lg:text-[15px] text-slate-700 transition-all duration-200 hover:bg-orange-50 hover:text-[#FF5E14] 2xl:text-base"
            >
              <Home size={18} />
              Trang chủ
            </button>

            <button
              type="button"
              onClick={handleNavigateServices}
              className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-1.5 py-3 text-[12px] font-extrabold lg:px-3 lg:text-[15px] transition-all duration-200 2xl:text-base ${
                currentView === "discovery"
                  ? "bg-orange-50 text-[#FF5E14]"
                  : "text-slate-700 hover:bg-orange-50 hover:text-[#FF5E14]"
              }`}
            >
              <Compass size={18} />
              Khám phá dịch vụ
            </button>

            {onOpenSupport && (
              <button
                type="button"
                onClick={handleOpenSupport}
                className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-1.5 py-3 text-[12px] font-extrabold lg:px-3 lg:text-[15px] text-slate-700 transition-all duration-200 hover:bg-orange-50 hover:text-[#FF5E14] 2xl:text-base"
              >
                <PhoneCall size={18} />
                Hỗ trợ
              </button>
            )}
          </nav>

          {/* DESKTOP DOWNLOAD BUTTON */}
          <div className="hidden shrink-0 md:flex">
            <button
              type="button"
              onClick={handleDownloadApp}
              className="group inline-flex h-10 items-center gap-1.5 rounded-full bg-[#FFBA08] py-1 pl-1 pr-2 lg:h-12 lg:gap-3 lg:py-1.5 lg:pl-1.5 lg:pr-5 text-slate-950 shadow-sm transition-all duration-300 hover:bg-[#FFCA36] hover:shadow-md active:scale-[0.97]"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white lg:h-9 lg:w-9">
                <Image
                  src="/ggplay.svg"
                  alt=""
                  width={24}
                  height={24}
                  className="h-6 w-6 object-contain"
                />
              </span>
              <span className="whitespace-nowrap text-xs font-bold lg:text-sm">
                Tải ứng dụng
              </span>
            </button>
          </div>

          {/* MOBILE / TABLET */}
          <div className="flex shrink-0 items-center gap-2 md:hidden">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              aria-label={isMobileMenuOpen ? "Đóng menu" : "Mở menu"}
              aria-expanded={isMobileMenuOpen}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-800 transition-colors hover:bg-orange-50 hover:text-[#FF5E14]"
            >
              {isMobileMenuOpen ? <X size={23} /> : <Menu size={23} />}
            </button>
          </div>
        </div>

        {/* MOBILE: drawer trượt từ mép phải, giữ nguyên các handlers */}
        {isMobileMenuOpen && (
          <>
            <button
              type="button"
              aria-label="Đóng menu"
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 z-[60] bg-slate-900/35 md:hidden"
            />
            <nav className="fixed right-0 top-0 z-[70] flex h-dvh w-[min(340px,90vw)] flex-col bg-white shadow-2xl md:hidden">
              <div className="flex h-[72px] shrink-0 items-center justify-between border-b border-slate-100 px-5">
                <button
                  type="button"
                  onClick={handleNavigateHome}
                  aria-label="Về trang chủ HandyGo"
                >
                  <Image
                    src="/handygo.svg"
                    alt="HandyGo"
                    width={270}
                    height={90}
                    className="h-auto w-[165px] object-contain"
                  />
                </button>
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  aria-label="Đóng menu"
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-700"
                >
                  <X size={23} />
                </button>
              </div>
              <div className="flex flex-col gap-1 overflow-y-auto px-4 py-5">
                <button
                  type="button"
                  onClick={handleNavigateHome}
                  className="flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold text-slate-700 transition-colors hover:bg-orange-50 hover:text-[#FF5E14]"
                >
                  <Home size={19} />
                  Trang chủ
                </button>
                <button
                  type="button"
                  onClick={handleNavigateServices}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold transition-colors ${
                    currentView === "discovery"
                      ? "bg-orange-50 text-[#FF5E14]"
                      : "text-slate-700 hover:bg-orange-50 hover:text-[#FF5E14]"
                  }`}
                >
                  <Compass size={19} />
                  Khám phá dịch vụ
                </button>
                {onOpenSupport && (
                  <button
                    type="button"
                    onClick={handleOpenSupport}
                    className="flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold text-slate-700 transition-colors hover:bg-orange-50 hover:text-[#FF5E14]"
                  >
                    <PhoneCall size={19} />
                    Hỗ trợ
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleDownloadApp}
                  className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-[#FFBA08] px-4 py-3 text-sm font-bold text-slate-950 transition-colors hover:bg-[#FFCA36]"
                >
                  <Image
                    src="/ggplay.svg"
                    alt=""
                    width={20}
                    height={20}
                    className="h-5 w-5 object-contain"
                  />
                  Tải ứng dụng
                </button>
              </div>
            </nav>
          </>
        )}
      </div>
    </header>
  );
};

export default CategoryServiceNavbar;
