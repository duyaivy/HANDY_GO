import React, { useState } from "react";
import {
  X,
  Smartphone,
  QrCode,
  Sparkles,
  Download,
  Send,
  CheckCircle2,
  Apple,
  Shield,
  Star,
  Zap,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { HandyGoLogo } from "./HandyGoLogo.js";

interface DownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DownloadModal: React.FC<DownloadModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [sentSuccess, setSentSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (phoneNumber.trim().length >= 9) {
      setSentSuccess(true);
      setTimeout(() => {
        setSentSuccess(false);
        setPhoneNumber("");
      }, 4000);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 15 }}
            transition={{ type: "spring", stiffness: 450, damping: 32 }}
            className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden z-10"
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-[#FF5E14] via-[#FF6F22] to-[#FFA048] p-6 sm:p-7 text-white relative">
              <motion.button
                type="button"
                onClick={onClose}
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                transition={{ duration: 0.2 }}
                className="absolute top-5 right-5 p-2 rounded-full bg-black/15 hover:bg-black/30 text-white transition-colors"
                aria-label="Đóng"
              >
                <X className="w-5 h-5" />
              </motion.button>

              <div className="flex items-center gap-2 mb-2">
                <span className="bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                  Ứng Dụng Di Động Miễn Phí
                </span>
              </div>

              <h3 className="text-2xl sm:text-3xl font-black tracking-tight">
                Tải Ngay Ứng Dụng Handy Go
              </h3>
              <p className="text-orange-100 text-xs sm:text-sm mt-1 leading-relaxed">
                Kết nối thợ điện nước, máy lạnh, khóa cửa lành nghề tận nhà chỉ
                trong 15 phút
              </p>
            </div>

            {/* Content body */}
            <div className="p-6 sm:p-7 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-center">
                {/* QR Code Card */}
                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 sm:p-5 flex flex-col items-center text-center shadow-xs">
                  <div className="bg-white p-3.5 rounded-xl shadow-xs border border-slate-200 mb-3">
                    {/* SVG QR Code Replica with Handy Go Center Badge */}
                    <div className="relative w-40 h-40">
                      <svg viewBox="0 0 120 120" className="w-full h-full">
                        {/* Corner Position Detection Patterns */}
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

                        {/* Simulated QR Pixel Matrix */}
                        <circle cx="45" cy="15" r="3" fill="#0f172a" />
                        <circle cx="55" cy="20" r="2.5" fill="#0f172a" />
                        <circle cx="65" cy="12" r="3" fill="#0f172a" />
                        <circle cx="75" cy="22" r="2.5" fill="#0f172a" />

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
                        <circle cx="105" cy="95" r="2.5" fill="#0f172a" />

                        <circle cx="50" cy="108" r="3" fill="#0f172a" />
                        <circle cx="65" cy="105" r="2.5" fill="#0f172a" />
                        <circle cx="80" cy="108" r="3" fill="#0f172a" />
                        <circle cx="95" cy="110" r="2.5" fill="#0f172a" />

                        {/* Center Brand Pin with official App Icon */}
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
                  <p className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                    <QrCode className="w-4 h-4 text-[#FF5E14]" />
                    Quét bằng Camera
                  </p>
                  <span className="text-xs text-slate-500 mt-1 font-medium">
                    Hỗ trợ iOS & Android
                  </span>
                </div>

                {/* Store Buttons & App Info */}
                <div className="space-y-3">
                  <motion.a
                    href="#download"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={(e) => {
                      e.preventDefault();
                      alert(
                        "Ứng dụng Handy Go sẵn sàng trên App Store! Đang chuyển hướng...",
                      );
                    }}
                    className="w-full py-3 px-4 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white flex items-center gap-3.5 transition-colors shadow-sm"
                  >
                    <div className="w-7 h-7 flex items-center justify-center">
                      <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.61-.75 1.04-1.8 0.92-2.87-0.91.04-1.98.61-2.61 1.36-.55.64-1.04 1.69-.91 2.72 1.01.08 2.01-.5 2.6-1.21z" />
                      </svg>
                    </div>
                    <div className="text-left">
                      <p className="text-[10px] text-slate-400 uppercase font-semibold leading-none">
                        Tải về từ
                      </p>
                      <p className="text-sm sm:text-base font-black leading-tight">
                        App Store (iOS)
                      </p>
                    </div>
                  </motion.a>

                  <motion.a
                    href="#download"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={(e) => {
                      e.preventDefault();
                      alert(
                        "Ứng dụng Handy Go sẵn sàng trên Google Play! Đang chuyển hướng...",
                      );
                    }}
                    className="w-full py-3 px-4 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white flex items-center gap-3.5 transition-colors shadow-sm"
                  >
                    <div className="w-7 h-7 flex items-center justify-center">
                      <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                        <path d="M3 20.5v-17c0-.83.67-1.5 1.5-1.5.34 0 .67.12.94.33L17.5 12 5.44 21.67c-.27.21-.6.33-.94.33C3.67 22 3 21.33 3 20.5zm16-7.39l2.7-1.56c.8-.46.8-1.76 0-2.22l-2.7-1.56-2.85 2.67 2.85 2.67zM4.75 3.32L14.7 12 4.75 20.68V3.32z" />
                      </svg>
                    </div>
                    <div className="text-left">
                      <p className="text-[10px] text-slate-400 uppercase font-semibold leading-none">
                        Tải về từ
                      </p>
                      <p className="text-sm sm:text-base font-black leading-tight">
                        Google Play
                      </p>
                    </div>
                  </motion.a>

                  <div className="pt-1.5 flex items-center gap-2 text-xs sm:text-sm text-slate-700 font-medium">
                    <Shield className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Bản quyền chính thức • Miễn phí 100%</span>
                  </div>
                </div>
              </div>

              {/* Send SMS Link Option */}
              <div className="pt-3 border-t border-slate-100">
                <p className="text-xs sm:text-sm font-bold text-slate-800 mb-2">
                  Hoặc nhận link tải ứng dụng qua tin nhắn điện thoại:
                </p>
                <form onSubmit={handleSubmit} className="flex gap-2">
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="Nhập số điện thoại của bạn..."
                    className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-[#FF5E14] focus:border-transparent"
                  />
                  <motion.button
                    type="submit"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    className="px-5 py-3 rounded-xl bg-[#FF5E14] text-white font-black text-xs sm:text-sm flex items-center gap-1.5 hover:bg-[#E04800] transition-colors whitespace-nowrap shadow-xs"
                  >
                    <Send className="w-4 h-4" />
                    <span>Gửi link</span>
                  </motion.button>
                </form>
                {sentSuccess && (
                  <motion.p
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xs sm:text-sm text-emerald-600 font-bold mt-2 flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Đã gửi link tải Handy Go đến số {phoneNumber}!
                  </motion.p>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
