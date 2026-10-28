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
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 xl:px-8">
        <div className="flex h-[88px] items-center justify-between gap-5">
          {/* LOGO */}
          <button
            type="button"
            onClick={handleNavigateHome}
            className="flex shrink-0 items-center"
            aria-label="Về trang chủ HandyGo"
          >
            <Image
              src="/handygo-logo-horizontal.svg"
              alt="HandyGo"
              width={270}
              height={90}
              priority
              className="h-auto w-[190px] object-contain sm:w-[210px]"
            />
          </button>

          {/* DESKTOP MENU */}
          <nav className="hidden min-w-0 items-center justify-center gap-1 xl:flex 2xl:gap-1.5">
            <button
              type="button"
              onClick={handleNavigateHome}
              className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-3 text-[15px] font-extrabold text-slate-700 transition-all duration-200 hover:bg-orange-50 hover:text-[#FF5E14] 2xl:text-base"
            >
              <Home size={18} />
              Trang chủ
            </button>

            <button
              type="button"
              onClick={handleNavigateServices}
              className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-3 text-[15px] font-extrabold transition-all duration-200 2xl:text-base ${
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
                className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-3 text-[15px] font-extrabold text-slate-700 transition-all duration-200 hover:bg-orange-50 hover:text-[#FF5E14] 2xl:text-base"
              >
                <PhoneCall size={18} />
                Hỗ trợ
              </button>
            )}
          </nav>

          {/* DESKTOP DOWNLOAD BUTTON */}
          <div className="hidden shrink-0 xl:flex">
            <button
              type="button"
              onClick={handleDownloadApp}
              className="group inline-flex h-12 items-center gap-3 rounded-full bg-[#FFBA08] py-1.5 pl-1.5 pr-5 text-slate-950 shadow-sm transition-all duration-300 hover:bg-[#FFCA36] hover:shadow-md active:scale-[0.97]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white">
                <Image
                  src="/ggplay.svg"
                  alt=""
                  width={24}
                  height={24}
                  className="h-6 w-6 object-contain"
                />
              </span>

              <span className="whitespace-nowrap text-sm font-bold">
                Tải ứng dụng
              </span>
            </button>
          </div>

          {/* MOBILE / TABLET */}
          <div className="flex shrink-0 items-center gap-2 xl:hidden">
            <button
              type="button"
              onClick={handleDownloadApp}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-[#FFBA08] py-1 pl-1 pr-3 text-slate-950 transition-all hover:bg-[#FFCA36] active:scale-[0.97]"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white">
                <Image
                  src="/ggplay.svg"
                  alt=""
                  width={20}
                  height={20}
                  className="h-5 w-5 object-contain"
                />
              </span>

              <span className="hidden whitespace-nowrap text-xs font-bold sm:inline">
                Tải ứng dụng
              </span>
            </button>

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
      </div>

      {/* MOBILE / TABLET MENU */}
      {isMobileMenuOpen && (
        <nav className="border-t border-slate-100 bg-white px-4 pb-4 pt-2 shadow-md xl:hidden">
          <div className="mx-auto flex max-w-[1600px] flex-col gap-1">
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
          </div>
        </nav>
      )}
    </header>
  );
};

export default CategoryServiceNavbar;
