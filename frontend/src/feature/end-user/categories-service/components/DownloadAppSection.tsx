"use client";

import Image from "next/image";
import { Smartphone } from "lucide-react";

export const DownloadAppSection = () => {
  return (
    <section
      id="download-app"
      className="scroll-mt-[88px] bg-slate-50/70 py-8 sm:py-12"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-[20px] bg-gradient-to-r from-[#FF6900] via-[#FF5E14] to-[#FF5722] px-6 py-7 shadow-[0_12px_30px_rgba(255,94,20,0.12)] sm:px-8 lg:px-10">
          <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between md:gap-8">
            {/* NỘI DUNG BÊN TRÁI */}
            <div className="max-w-[680px] text-white">
              <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-3 py-1 text-[11px] font-medium text-white">
                <Smartphone size={12} />
                Ứng dụng di động HandyGo
              </div>

              <h2 className="text-2xl font-extrabold leading-tight tracking-tight sm:text-[28px]">
                Đặt thợ nhanh hơn &amp; Theo dõi tiến độ trực tiếp
              </h2>

              <p className="mt-2 max-w-[570px] text-sm leading-relaxed text-white/95">
                Tải app HandyGo để nhận thông báo tức thì khi thợ nhận việc,
                định vị thợ đang di chuyển và quản lý hóa đơn bảo hành trọn đời
                chỉ bằng một chạm.
              </p>
            </div>

            {/* APP STORE & GOOGLE PLAY */}
            <div className="flex w-full shrink-0 flex-col items-center gap-3 sm:w-[230px]">
              <div
                className="flex w-full items-center justify-center"
                aria-label="Ứng dụng HandyGo sắp ra mắt trên App Store"
              >
                <Image
                  src="/en-us.svg"
                  alt="App Store"
                  width={210}
                  height={64}
                  className="h-auto w-[210px] max-w-full object-contain"
                />
              </div>

              <div
                className="flex w-full items-center justify-center"
                aria-label="Ứng dụng HandyGo sắp ra mắt trên Google Play"
              >
                <Image
                  src="/chpl.svg"
                  alt="Google Play"
                  width={210}
                  height={70}
                  className="h-auto w-[210px] max-w-full object-contain"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
