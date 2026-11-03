"use client";

import React from "react";
import Image from "next/image";
import { QrCode, CheckCircle2, Tag } from "lucide-react";
import { motion } from "motion/react";

interface DownloadCTAProps {
  onOpenDownload: () => void;
}

export const DownloadCTA: React.FC<DownloadCTAProps> = ({ onOpenDownload }) => {
  return (
    <section
      id="download"
      className="relative overflow-hidden bg-white py-20 lg:py-28"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 35 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{
            duration: 0.7,
            ease: [0.16, 1, 0.3, 1],
          }}
          className="orange-glow-lg relative overflow-hidden rounded-3xl bg-linear-to-r from-[#FF5E14] via-[#FF6F22] to-[#FFA048] p-8 text-white shadow-2xl sm:p-12 lg:p-16"
        >
          {/* Background Animation */}
          <motion.div
            animate={{
              scale: [1, 1.2, 1],
              rotate: [0, 45, 0],
            }}
            transition={{
              duration: 12,
              repeat: Infinity,
              ease: "linear",
            }}
            className="pointer-events-none absolute top-0 right-0 -mt-20 -mr-20 h-96 w-96 rounded-full bg-white/10 blur-2xl"
          />

          <div className="pointer-events-none absolute bottom-0 left-0 -mb-20 -ml-20 h-96 w-96 rounded-full bg-black/10 blur-2xl" />

          <div className="relative z-10 grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
            {/* Left Column */}
            <div className="space-y-6 lg:col-span-7">
              {/* Voucher Badge */}
              <div className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3.5 py-1.5 text-xs font-extrabold tracking-wider text-white uppercase backdrop-blur-md sm:text-sm">
                <Tag className="h-4 w-4 text-yellow-300" />

                <span>Tặng Voucher 50.000đ Cho Đơn Đầu Tiên</span>
              </div>

              {/* Title */}
              <h2 className="text-3xl leading-tight font-black tracking-tight text-white sm:text-4xl lg:text-5xl">
                Tải Ứng Dụng Handy Go Ngay Hôm Nay!
              </h2>

              {/* Description */}
              <p className="max-w-xl text-base leading-relaxed font-normal text-white/95 sm:text-lg">
                Đừng để sự cố điện nước hay máy lạnh làm xáo trộn cuộc sống của
                bạn. Cài đặt sẵn Handy Go trong điện thoại để luôn có chuyên gia
                kỹ thuật hỗ trợ 24/7 chỉ sau 15 phút.
              </p>

              {/* Coupon Box */}
              <motion.div
                whileHover={{ scale: 1.02 }}
                className="inline-flex cursor-default items-center gap-4 rounded-2xl border border-white/30 bg-white/15 p-4 shadow-xs backdrop-blur-md"
              >
                <div className="text-left">
                  <span className="block text-xs font-bold tracking-wider text-white/90 uppercase">
                    Mã khuyến mãi người dùng mới
                  </span>

                  <span className="font-mono text-xl font-black tracking-widest text-white sm:text-2xl">
                    HANDYGO50
                  </span>
                </div>

                <div className="h-10 w-px bg-white/30" />

                <span className="text-sm font-black text-yellow-300 sm:text-base">
                  Giảm ngay 50.000đ vào hóa đơn
                </span>
              </motion.div>

              {/* Store Download Buttons */}
              <div className="flex flex-wrap items-center gap-4 pt-2">
                {/* App Store */}
                <motion.button
                  type="button"
                  onClick={onOpenDownload}
                  whileHover={{
                    scale: 1.05,
                    y: -2,
                  }}
                  whileTap={{
                    scale: 0.95,
                  }}
                  transition={{
                    type: "spring",
                    stiffness: 400,
                    damping: 25,
                  }}
                  className="relative h-[52px] w-[170px] cursor-pointer border-0 bg-transparent p-0 shadow-none"
                  aria-label="Tải ứng dụng trên App Store"
                >
                  <Image
                    src="/en-us.svg"
                    alt="Download on the App Store"
                    fill
                    sizes="170px"
                    className="object-contain"
                  />
                </motion.button>

                {/* Google Play */}
                <motion.button
                  type="button"
                  onClick={onOpenDownload}
                  whileHover={{
                    scale: 1.05,
                    y: -2,
                  }}
                  whileTap={{
                    scale: 0.95,
                  }}
                  transition={{
                    type: "spring",
                    stiffness: 400,
                    damping: 25,
                  }}
                  className="relative h-[52px] w-[170px] cursor-pointer border-0 bg-transparent p-0 shadow-none"
                  aria-label="Tải ứng dụng trên Google Play"
                >
                  <Image
                    src="/chpl.svg"
                    alt="Get it on Google Play"
                    fill
                    sizes="170px"
                    className="object-contain"
                  />
                </motion.button>
              </div>
            </div>

            {/* Right Column - QR Code */}
            <div className="flex justify-center lg:col-span-5">
              <motion.div
                whileHover={{
                  y: -6,
                  scale: 1.02,
                }}
                transition={{
                  duration: 0.25,
                }}
                className="flex w-full max-w-sm flex-col items-center rounded-3xl border border-white/60 bg-white p-7 text-center text-slate-900 shadow-2xl sm:p-8"
              >
                {/* QR Code Container */}
                <div className="mb-4 rounded-2xl border border-slate-200/90 bg-slate-50 p-4.5 shadow-inner">
                  <div className="relative h-48 w-48">
                    <svg viewBox="0 0 120 120" className="h-full w-full">
                      {/* Detection Patterns */}
                      <rect
                        x="5"
                        y="5"
                        width="30"
                        height="30"
                        rx="4"
                        fill="#0f172a"
                      />
                      <rect
                        x="9"
                        y="9"
                        width="22"
                        height="22"
                        rx="2"
                        fill="#ffffff"
                      />
                      <rect
                        x="13"
                        y="13"
                        width="14"
                        height="14"
                        rx="2"
                        fill="#FF5E14"
                      />

                      <rect
                        x="85"
                        y="5"
                        width="30"
                        height="30"
                        rx="4"
                        fill="#0f172a"
                      />
                      <rect
                        x="89"
                        y="9"
                        width="22"
                        height="22"
                        rx="2"
                        fill="#ffffff"
                      />
                      <rect
                        x="93"
                        y="13"
                        width="14"
                        height="14"
                        rx="2"
                        fill="#FF5E14"
                      />

                      <rect
                        x="5"
                        y="85"
                        width="30"
                        height="30"
                        rx="4"
                        fill="#0f172a"
                      />
                      <rect
                        x="9"
                        y="89"
                        width="22"
                        height="22"
                        rx="2"
                        fill="#ffffff"
                      />
                      <rect
                        x="13"
                        y="93"
                        width="14"
                        height="14"
                        rx="2"
                        fill="#FF5E14"
                      />

                      {/* Decorative Pixels */}
                      <circle cx="45" cy="15" r="3" fill="#0f172a" />
                      <circle cx="55" cy="22" r="2.5" fill="#0f172a" />
                      <circle cx="68" cy="15" r="3" fill="#0f172a" />
                      <circle cx="75" cy="25" r="2.5" fill="#0f172a" />

                      <circle cx="48" cy="35" r="3" fill="#0f172a" />
                      <circle cx="60" cy="32" r="2.5" fill="#0f172a" />
                      <circle cx="72" cy="40" r="3" fill="#0f172a" />

                      <circle cx="15" cy="48" r="3" fill="#0f172a" />
                      <circle cx="25" cy="55" r="2.5" fill="#0f172a" />
                      <circle cx="35" cy="45" r="3" fill="#0f172a" />

                      <circle cx="85" cy="50" r="3" fill="#0f172a" />
                      <circle cx="98" cy="45" r="2.5" fill="#0f172a" />
                      <circle cx="105" cy="58" r="3" fill="#0f172a" />

                      <circle cx="45" cy="85" r="3" fill="#0f172a" />
                      <circle cx="58" cy="95" r="2.5" fill="#0f172a" />
                      <circle cx="70" cy="82" r="3" fill="#0f172a" />
                      <circle cx="82" cy="90" r="2.5" fill="#0f172a" />
                      <circle cx="95" cy="80" r="3" fill="#0f172a" />

                      {/* App Icon */}
                      <image
                        href="/handygo-app-icon.svg"
                        x="42"
                        y="42"
                        width="36"
                        height="36"
                      />
                    </svg>
                  </div>
                </div>

                {/* QR Title */}
                <h4 className="flex items-center gap-2 text-base font-black text-slate-900">
                  <QrCode className="h-5 w-5 text-[#FF5E14]" />
                  Quét Mã Để Tải Ứng Dụng
                </h4>

                {/* QR Description */}
                <p className="mt-1 text-xs leading-relaxed text-slate-600 sm:text-sm">
                  Mở camera điện thoại quét để tự động mở App Store hoặc Google
                  Play
                </p>

                {/* Footer */}
                <div className="mt-4 flex w-full items-center justify-center gap-1.5 border-t border-slate-100 pt-3 text-xs font-extrabold text-emerald-700">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />

                  <span>Dung lượng nhẹ ~35MB • Tải nhanh</span>
                </div>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
