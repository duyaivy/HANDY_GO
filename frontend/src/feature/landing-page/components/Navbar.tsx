import React, { useState, useEffect } from "react";
import Image from "next/image";
import {
  Menu,
  X,
  Smartphone,
  Home,
  Info,
  Users,
  Wrench,
  Star,
  PhoneCall,
  ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useLenis } from "lenis/react";
declare global {
  interface Window {
    __handyGoLenis?: ReturnType<typeof useLenis>;
  }
}
interface NavbarProps {
  onOpenDownload: () => void;
  onOpenAuth: (mode: "login" | "register") => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenDownload,
  onOpenAuth,
}) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("");
  const lenis = useLenis();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);

      // Track active section for indicator
      const sections = [
        "about",
        "customers",
        "craftsmen",
        "reviews",
        "download",
      ];
      const scrollPos = window.scrollY + 160;

      for (let i = sections.length - 1; i >= 0; i--) {
        const el = document.getElementById(sections[i]);
        if (el && el.offsetTop <= scrollPos) {
          setActiveSection(sections[i]);
          return;
        }
      }
      if (window.scrollY < 200) {
        setActiveSection("");
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Butter-smooth Lenis scroll with zero-jump guarantee
  const handleScrollTo = (
    e: React.MouseEvent<HTMLAnchorElement>,
    targetId: string,
  ) => {
    e.preventDefault();
    setIsMobileMenuOpen(false);

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

    const headerOffset = 90;

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

  const navLinks = [
    { id: "about", label: "Về chúng tôi", icon: Info },
    { id: "customers", label: "Khách hàng", icon: Users },
    { id: "craftsmen", label: "Thợ Handy Go", icon: Wrench },
    { id: "reviews", label: "Đánh giá", icon: Star },
    { id: "download", label: "Download App", icon: Smartphone, isBadge: true },
  ];

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${
          isScrolled
            ? "bg-white/95 backdrop-blur-md shadow-md border-b border-slate-100 py-3 sm:py-4"
            : "bg-white/95 backdrop-blur-sm py-4 sm:py-5"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            {/* Brand Logo - ĐƯỜNG DẪN ẢNH TRỰC TIẾP */}
            <motion.a
              href="#"
              onClick={(e) => handleScrollTo(e, "top")}
              className="flex items-center shrink-0 cursor-pointer"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              aria-label="HandyGo Trang chủ"
            >
              {/* 👉 BẠN CÓ THỂ ĐỔI TRỰC TIẾP ĐƯỜNG DẪN ẢNH TẠI THUỘC TÍNH src DƯỚI ĐÂY: */}
              <Image
                src="/handygo-logo-horizontal.svg"
                alt="HandyGo Logo"
                width={2000}
                height={100}
                priority
                className="h-18 sm:h-20 w-auto object-contain"
              />
            </motion.a>

            {/* DESKTOP ONLY: Horizontal Navigation Links (>= 1024px) */}
            <nav className="hidden lg:flex items-center gap-7 xl:gap-8 text-base lg:text-[16px] xl:text-[17px] font-bold text-slate-800">
              {navLinks.map((link) => {
                const isActive = activeSection === link.id;
                return (
                  <a
                    key={link.id}
                    href={`#${link.id}`}
                    onClick={(e) => handleScrollTo(e, link.id)}
                    className={`relative py-2 px-1 transition-colors flex items-center gap-1.5 cursor-pointer group ${
                      isActive
                        ? "text-[#FF5E14]"
                        : "text-slate-800 hover:text-[#FF5E14]"
                    }`}
                  >
                    <span>{link.label}</span>
                    {link.isBadge && (
                      <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-orange-100 text-[#FF5E14] group-hover:bg-[#FF5E14] group-hover:text-white transition-colors">
                        App
                      </span>
                    )}
                    <span
                      className={`absolute bottom-0 left-0 h-0.5 bg-[#FF5E14] transition-all duration-300 ${
                        isActive ? "w-full" : "w-0 group-hover:w-full"
                      }`}
                    />
                  </a>
                );
              })}
            </nav>

            {/* DESKTOP ONLY: Auth Action Button (>= 1024px) */}
            <div className="hidden lg:flex items-center gap-3">
              <motion.button
                type="button"
                onClick={() => onOpenAuth("login")}
                whileHover={{ scale: 1.04, y: -1 }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="px-6 py-2.5 rounded-2xl bg-linear-to-r from-[#FF5E14] to-[#FF772E] text-white font-bold text-sm lg:text-base shadow-md shadow-orange-500/25 hover:shadow-orange-500/40 transition-all cursor-pointer"
              >
                Đăng nhập
              </motion.button>
            </div>

            {/* MOBILE & TABLET (< 1024px): Có nút Đăng nhập cho Tablet + Nút Dấu 3 gạch */}
            <div className="flex lg:hidden items-center gap-2 sm:gap-3">
              {/* Nút Đăng nhập cho Tablet (không logo) */}
              <button
                type="button"
                onClick={() => onOpenAuth("login")}
                className="hidden sm:inline-flex px-4 py-2 rounded-xl bg-linear-to-r from-[#FF5E14] to-[#FF772E] text-white font-bold text-sm shadow-xs hover:opacity-95 transition-all cursor-pointer"
              >
                Đăng nhập
              </button>

              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(true)}
                className="p-2 sm:p-2.5 rounded-xl sm:rounded-2xl bg-slate-100 text-slate-800 hover:bg-slate-200 transition-all cursor-pointer flex items-center justify-center"
                aria-label="Mở menu điều hướng (dấu 3 gạch)"
                aria-expanded={isMobileMenuOpen}
              >
                <Menu className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* KHI BẤM DẤU 3 GẠCH: HIỆN MENU TRƯỢT TỪ PHẢI QUA TRÁI (RIGHT-TO-LEFT SIDE DRAWER) */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex justify-end">
            {/* Lớp nền tối mờ (Backdrop overlay) */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs cursor-pointer"
              aria-hidden="true"
            />

            {/* Khung Menu trượt mượt mà TỪ PHẢI QUA TRÁI:
                - Mobile: chiếm 1/2 màn hình (w-1/2)
                - Tablet: chiếm 1/3 màn hình (sm:w-1/3 md:w-1/3)
            */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
              className="relative w-1/2 sm:w-1/3 md:w-1/3 h-full bg-white shadow-2xl flex flex-col justify-between overflow-y-auto z-10 border-l border-slate-100"
            >
              {/* Đầu Drawer: Tiêu đề & Nút đóng X */}
              <div className="p-3 sm:p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
                <div className="flex items-center gap-2 overflow-hidden">
                  <Image
                    src="/logo.png"
                    alt="HandyGo Logo"
                    width={800}
                    height={600}
                    onError={(e) => {
                      e.currentTarget.src = "/handygo-logo-horizontal.png";
                    }}
                    className="h-7 sm:h-8 w-auto object-contain max-w-30"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1.5 sm:p-2 rounded-lg bg-slate-200/80 hover:bg-orange-500 hover:text-white text-slate-700 transition-colors cursor-pointer shrink-0"
                  aria-label="Đóng menu"
                >
                  <X className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>

              {/* Thân Drawer: Các tab menu theo cột dọc trượt từ phải sang */}
              <div className="p-3 sm:p-4 space-y-2 flex-1 overflow-y-auto">
                <div className="flex flex-col space-y-1">
                  <a
                    href="#"
                    onClick={(e) => handleScrollTo(e, "top")}
                    className="flex items-center justify-between px-3 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-slate-800 hover:bg-orange-50 hover:text-[#FF5E14] transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2 sm:gap-2.5 truncate">
                      <Home className="w-4 h-4 text-[#FF5E14] shrink-0" />
                      <span className="truncate">Trang chủ</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  </a>

                  {navLinks.map((link) => (
                    <a
                      key={link.id}
                      href={`#${link.id}`}
                      onClick={(e) => {
                        if (link.id === "download") {
                          e.preventDefault();
                          setIsMobileMenuOpen(false);
                          onOpenDownload();
                        } else {
                          handleScrollTo(e, link.id);
                        }
                      }}
                      className="flex items-center justify-between px-3 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-slate-800 hover:bg-orange-50 hover:text-[#FF5E14] transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2 sm:gap-2.5 truncate">
                        <link.icon className="w-4 h-4 text-[#FF5E14] shrink-0" />
                        <span className="truncate">{link.label}</span>
                      </div>
                      {link.isBadge ? (
                        <span className="text-[10px] sm:text-xs font-black px-1.5 sm:px-2 py-0.5 rounded-full bg-orange-100 text-[#FF5E14] shrink-0">
                          Tải Ngay
                        </span>
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      )}
                    </a>
                  ))}
                </div>
              </div>

              {/* Chân Drawer: Nút Đăng nhập (không logo) & Hotline */}
              <div className="p-3 sm:p-4 border-t border-slate-100 bg-slate-50/70 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onOpenAuth("login");
                  }}
                  className="w-full py-2.5 sm:py-3 px-3 rounded-xl bg-linear-to-r from-[#FF5E14] to-[#FF772E] text-white text-xs sm:text-sm font-bold text-center shadow-md shadow-orange-500/20 cursor-pointer hover:opacity-95"
                >
                  Đăng nhập
                </button>

                <a
                  href="tel:19006868"
                  className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl bg-white border border-slate-200 text-[11px] sm:text-xs font-bold text-emerald-700"
                >
                  <PhoneCall className="w-3.5 h-3.5 shrink-0" />
                  <span>1900 6868 (Miễn cước)</span>
                </a>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
