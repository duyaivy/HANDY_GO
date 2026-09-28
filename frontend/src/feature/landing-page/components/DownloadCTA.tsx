import React from 'react';
import {
  
  QrCode,
  
  CheckCircle2,
  Tag,
} from 'lucide-react';
import { motion } from 'motion/react';

interface DownloadCTAProps {
  onOpenDownload: () => void;
}

export const DownloadCTA: React.FC<DownloadCTAProps> = ({ onOpenDownload }) => {
  return (
    <section id="download" className="py-20 lg:py-28 bg-white relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 35 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="relative rounded-3xl bg-linear-to-r from-[#FF5E14] via-[#FF6F22] to-[#FFA048] p-8 sm:p-12 lg:p-16 text-white shadow-2xl orange-glow-lg overflow-hidden"
        >
          {/* Subtle animated geometric circles in background */}
          <motion.div
            animate={{
              scale: [1, 1.2, 1],
              rotate: [0, 45, 0],
            }}
            transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
            className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 rounded-full bg-white/10 blur-2xl pointer-events-none"
          />
          <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-96 h-96 rounded-full bg-black/10 blur-2xl pointer-events-none" />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center relative z-10">
            {/* Left Column: CTA Pitch */}
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/20 backdrop-blur-md text-white text-xs sm:text-sm font-extrabold uppercase tracking-wider">
                <Tag className="w-4 h-4 text-yellow-300" />
                <span>Tặng Voucher 50.000đ Cho Đơn Đầu Tiên</span>
              </div>

              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight">
                Tải Ứng Dụng Handy Go Ngay Hôm Nay!
              </h2>

              <p className="text-white/95 text-base sm:text-lg max-w-xl leading-relaxed font-normal">
                Đừng để sự cố điện nước hay máy lạnh làm xáo trộn cuộc sống của bạn. Cài đặt sẵn Handy Go trong điện thoại để luôn có chuyên gia kỹ thuật hỗ trợ 24/7 chỉ sau 15 phút.
              </p>

              {/* Coupon Box with hover effect */}
              <motion.div
                whileHover={{ scale: 1.02 }}
                className="inline-flex items-center gap-4 p-4 rounded-2xl bg-white/15 backdrop-blur-md border border-white/30 shadow-xs cursor-default"
              >
                <div className="text-left">
                  <span className="block text-xs text-white/90 font-bold uppercase tracking-wider">
                    Mã khuyến mãi người dùng mới
                  </span>
                  <span className="text-xl sm:text-2xl font-mono font-black text-white tracking-widest">
                    HANDYGO50
                  </span>
                </div>
                <div className="h-10 w-px bg-white/30" />
                <span className="text-sm sm:text-base font-black text-yellow-300">
                  Giảm ngay 50.000đ vào hóa đơn
                </span>
              </motion.div>

              {/* Store Download Buttons */}
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <motion.button
                  type="button"
                  onClick={onOpenDownload}
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  className="px-7 py-4 rounded-2xl bg-slate-950 hover:bg-slate-900 text-white flex items-center gap-3.5 shadow-lg"
                >
                  <svg className="w-7 h-7 fill-current" viewBox="0 0 24 24">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.61-.75 1.04-1.8 0.92-2.87-0.91.04-1.98.61-2.61 1.36-.55.64-1.04 1.69-.91 2.72 1.01.08 2.01-.5 2.6-1.21z" />
                  </svg>
                  <div className="text-left">
                    <span className="block text-[10px] text-slate-400 uppercase font-semibold leading-none">
                      Tải về trên
                    </span>
                    <span className="text-sm font-black leading-tight">App Store</span>
                  </div>
                </motion.button>

                <motion.button
                  type="button"
                  onClick={onOpenDownload}
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  className="px-7 py-4 rounded-2xl bg-slate-950 hover:bg-slate-900 text-white flex items-center gap-3.5 shadow-lg"
                >
                  <svg className="w-7 h-7 fill-current" viewBox="0 0 24 24">
                    <path d="M3 20.5v-17c0-.83.67-1.5 1.5-1.5.34 0 .67.12.94.33L17.5 12 5.44 21.67c-.27.21-.6.33-.94.33C3.67 22 3 21.33 3 20.5zm16-7.39l2.7-1.56c.8-.46.8-1.76 0-2.22l-2.7-1.56-2.85 2.67 2.85 2.67zM4.75 3.32L14.7 12 4.75 20.68V3.32z" />
                  </svg>
                  <div className="text-left">
                    <span className="block text-[10px] text-slate-400 uppercase font-semibold leading-none">
                      Khám phá tại
                    </span>
                    <span className="text-sm font-black leading-tight">Google Play</span>
                  </div>
                </motion.button>
              </div>
            </div>

            {/* Right Column: High-Res QR Code Card & Phone Preview */}
            <div className="lg:col-span-5 flex justify-center">
              <motion.div
                whileHover={{ y: -6, scale: 1.02 }}
                transition={{ duration: 0.25 }}
                className="bg-white rounded-3xl p-7 sm:p-8 text-slate-900 shadow-2xl flex flex-col items-center text-center max-w-sm w-full border border-white/60"
              >
                <div className="bg-slate-50 p-4.5 rounded-2xl border border-slate-200/90 shadow-inner mb-4">
                  {/* Clean Vector QR Code */}
                  <div className="w-48 h-48 relative">
                    <svg viewBox="0 0 120 120" className="w-full h-full">
                      {/* Detection patterns */}
                      <rect x="5" y="5" width="30" height="30" rx="4" fill="#0f172a" />
                      <rect x="9" y="9" width="22" height="22" rx="2" fill="#ffffff" />
                      <rect x="13" y="13" width="14" height="14" rx="2" fill="#FF5E14" />

                      <rect x="85" y="5" width="30" height="30" rx="4" fill="#0f172a" />
                      <rect x="89" y="9" width="22" height="22" rx="2" fill="#ffffff" />
                      <rect x="93" y="13" width="14" height="14" rx="2" fill="#FF5E14" />

                      <rect x="5" y="85" width="30" height="30" rx="4" fill="#0f172a" />
                      <rect x="9" y="89" width="22" height="22" rx="2" fill="#ffffff" />
                      <rect x="13" y="93" width="14" height="14" rx="2" fill="#FF5E14" />

                      {/* Random pixels */}
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

                      {/* Center Brand Pin with official App Icon */}
                      <image href="/handygo-app-icon.svg" x="42" y="42" width="36" height="36" />
                    </svg>
                  </div>
                </div>

                <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-[#FF5E14]" />
                  Quét Mã Để Tải Ứng Dụng
                </h4>
                <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed">
                  Mở camera điện thoại quét để tự động mở App Store hoặc Google Play
                </p>

                <div className="mt-4 pt-3 border-t border-slate-100 w-full flex items-center justify-center gap-1.5 text-xs text-emerald-700 font-extrabold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
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
