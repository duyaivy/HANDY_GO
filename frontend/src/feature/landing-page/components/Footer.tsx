import React from "react";

import {
  PhoneCall,
  Mail,
  MapPin,
  ShieldCheck,
  Smartphone,
  ArrowRight,
} from "lucide-react";
import { FaFacebookF, FaYoutube, FaInstagram } from "react-icons/fa";
import { motion } from "motion/react";
import { useLenis } from "lenis/react";
declare global {
  interface Window {
    __handyGoLenis?: ReturnType<typeof useLenis>;
  }
}
interface FooterProps {
  onOpenDownload: () => void;
  onOpenAuth: (mode: "login" | "register") => void;
}

export const Footer: React.FC<FooterProps> = ({
  onOpenDownload,
  onOpenAuth,
}) => {
  const lenis = useLenis();

  // Butter-smooth Lenis scroll handler with zero-jump guarantee
  const handleScrollTo = (
    e: React.MouseEvent<HTMLAnchorElement>,
    targetId: string,
  ) => {
    e.preventDefault();

    const activeLenis =
      lenis || (typeof window !== "undefined" ? window.__handyGoLenis : null);

    if (targetId === "top") {
      if (activeLenis) {
        activeLenis.scrollTo(0, {
          duration: 1.4,
          immediate: false,
          lock: false,
          easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        });
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      return;
    }

    const element = document.getElementById(targetId);
    if (!element) return;

    const headerOffset = 95;

    if (activeLenis) {
      activeLenis.scrollTo(element, {
        offset: -headerOffset,
        duration: 1.4,
        immediate: false,
        lock: false,
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      });
      return;
    }

    // High-precision RAF smooth scroll fallback
    const startY = window.pageYOffset;
    const targetY = element.getBoundingClientRect().top + startY - headerOffset;
    const distance = targetY - startY;
    const duration = 1400;
    let startTime: number | null = null;

    const easeInOutCubic = (t: number) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const animationStep = (currentTime: number) => {
      if (!startTime) startTime = currentTime;
      const timeElapsed = currentTime - startTime;
      const progress = Math.min(timeElapsed / duration, 1);
      const ease = easeInOutCubic(progress);

      window.scrollTo(0, startY + distance * ease);

      if (progress < 1) {
        requestAnimationFrame(animationStep);
      }
    };

    requestAnimationFrame(animationStep);
  };

  return (
    <footer className="bg-slate-950 text-white pt-20 pb-14 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-10 lg:gap-12 pb-14 border-b border-slate-800/80">
          {/* Brand Info & Mission */}
          <div className="lg:col-span-4 space-y-5">
            <a
              href="#"
              onClick={(e) => handleScrollTo(e, "top")}
              className="inline-block cursor-pointer"
            >
              {/* 👉 BẠN CÓ THỂ ĐỔI TRỰC TIẾP ĐƯỜNG DẪN ẢNH LOGO FOOTER TẠI ĐÂY: */}
              <img
                src="/logo.png"
                alt="HandyGo Logo"
                onError={(e) => {
                  e.currentTarget.src = "/handygo-logo-white.png";
                }}
                className="h-12 sm:h-14 w-auto object-contain"
              />
            </a>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-sm font-normal">
              Handy Go là nền tảng công nghệ kết nối thợ sửa chữa lành nghề và
              khách hàng hàng đầu Việt Nam. Chúng tôi mang đến giải pháp tìm thợ
              tận nhà nhanh chóng trong 15 phút, theo dõi trực tiếp trên điện
              thoại và an tâm tuyệt đối.
            </p>
            <div className="pt-2 flex items-center gap-3.5">
              <a
                href="#"
                className="w-11 h-11 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-300 hover:text-white hover:bg-[#FF5E14] hover:border-[#FF5E14] transition-all"
                aria-label="Facebook"
              >
                <FaFacebookF className="w-5 h-5" />
              </a>
              <a
                href="#"
                className="w-11 h-11 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-300 hover:text-white hover:bg-[#FF5E14] hover:border-[#FF5E14] transition-all"
                aria-label="YouTube"
              >
                <FaYoutube className="w-5 h-5" />
              </a>
              <a
                href="#"
                className="w-11 h-11 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-300 hover:text-white hover:bg-[#FF5E14] hover:border-[#FF5E14] transition-all"
                aria-label="Instagram"
              >
                <FaInstagram className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* Core Navigation according to Header */}
          <div className="lg:col-span-3 space-y-4">
            <h4 className="text-sm sm:text-base font-black uppercase tracking-wider text-orange-400">
              Điều Hướng Nhanh
            </h4>
            <ul className="space-y-3 text-sm sm:text-base text-slate-300 font-medium">
              <li>
                <a
                  href="#about"
                  onClick={(e) => handleScrollTo(e, "about")}
                  className="hover:text-white hover:translate-x-1 inline-flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <ArrowRight className="w-4 h-4 text-orange-500" />
                  <span>Về chúng tôi</span>
                </a>
              </li>
              <li>
                <a
                  href="#customers"
                  onClick={(e) => handleScrollTo(e, "customers")}
                  className="hover:text-white hover:translate-x-1 inline-flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <ArrowRight className="w-4 h-4 text-orange-500" />
                  <span>Khách hàng & Dịch vụ</span>
                </a>
              </li>
              <li>
                <a
                  href="#craftsmen"
                  onClick={(e) => handleScrollTo(e, "craftsmen")}
                  className="hover:text-white hover:translate-x-1 inline-flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <ArrowRight className="w-4 h-4 text-orange-500" />
                  <span>Đội ngũ thợ lành nghề</span>
                </a>
              </li>
              <li>
                <a
                  href="#reviews"
                  onClick={(e) => handleScrollTo(e, "reviews")}
                  className="hover:text-white hover:translate-x-1 inline-flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <ArrowRight className="w-4 h-4 text-orange-500" />
                  <span>Đánh giá từ khách hàng</span>
                </a>
              </li>
              <li>
                <a
                  href="#download"
                  onClick={(e) => handleScrollTo(e, "download")}
                  className="hover:text-white hover:translate-x-1 inline-flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <ArrowRight className="w-4 h-4 text-orange-500" />
                  <span>Download ứng dụng di động</span>
                </a>
              </li>
            </ul>
          </div>

          {/* Account Actions */}
          <div className="lg:col-span-2 space-y-4">
            <h4 className="text-sm sm:text-base font-black uppercase tracking-wider text-orange-400">
              Tài Khoản
            </h4>
            <ul className="space-y-3 text-sm sm:text-base text-slate-300 font-medium">
              <li>
                <button
                  type="button"
                  onClick={() => onOpenAuth("login")}
                  className="hover:text-white hover:translate-x-1 inline-flex items-center gap-1.5 transition-all text-left cursor-pointer"
                >
                  <ArrowRight className="w-4 h-4 text-orange-500" />
                  <span>Đăng nhập tài khoản</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onOpenAuth("login")}
                  className="hover:text-white hover:translate-x-1 inline-flex items-center gap-1.5 transition-all text-left cursor-pointer"
                >
                  <ArrowRight className="w-4 h-4 text-orange-500" />
                  <span>Cổng đăng nhập Thợ</span>
                </button>
              </li>
            </ul>
          </div>

          {/* Contact & Mobile Download */}
          <div className="lg:col-span-3 space-y-4">
            <h4 className="text-sm sm:text-base font-black uppercase tracking-wider text-orange-400">
              Liên Hệ & Hỗ Trợ
            </h4>
            <div className="space-y-3 text-sm sm:text-base text-slate-300">
              <div className="flex items-start gap-2.5">
                <MapPin className="w-5 h-5 text-[#FF5E14] shrink-0 mt-0.5" />
                <span className="leading-relaxed">
                  Trường đại học bách khoa thành phố Đà Nẵng
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <PhoneCall className="w-5 h-5 text-[#FF5E14] shrink-0" />
                <div>
                  <span className="text-slate-400 text-xs block">
                    Tổng đài cứu hộ 24/7
                  </span>
                  <span className="font-black text-white text-base sm:text-lg text-emerald-400">
                    0327633137
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <Mail className="w-5 h-5 text-[#FF5E14] shrink-0" />
                <span className="font-medium">hotro@handygo.vn</span>
              </div>
            </div>

            <div className="pt-2">
              <motion.button
                type="button"
                onClick={onOpenDownload}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-[#FF5E14] to-[#FF772E] text-white text-sm sm:text-base font-black shadow-lg orange-glow transition-all flex items-center justify-center gap-2.5"
              >
                <Smartphone className="w-5 h-5" />
                <span>Tải App Handy Go Ngay</span>
              </motion.button>
            </div>
          </div>
        </div>

        {/* Bottom Copyright & Registered Stamp */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-400">
          <p>
            © 2026 Handy Go Platform Joint Stock Company. All rights reserved.
          </p>
          <div className="flex items-center gap-4 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-bold bg-emerald-950/80 px-3 py-1 rounded-lg border border-emerald-800">
              <ShieldCheck className="w-4 h-4" />
              Đã đăng ký Bộ Công Thương
            </span>
            <span className="text-xs text-slate-400">
              Bảo mật thanh toán PCI-DSS
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};
