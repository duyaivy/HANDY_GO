"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Menu,
  X,
  Home,
  Info,
  Users,
  Wrench,
  Search,
  Star,
  Smartphone,
  LogIn,
  ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useLenis } from "lenis/react";

interface NavbarProps {
  onOpenDownload: () => void;
}

const navLinks = [
  { id: "about", label: "Về chúng tôi", icon: Info },
  {
    id: "services",
    label: "Khám phá dịch vụ",
    icon: Search,
    href: "/services",
  },
  { id: "customers", label: "Khách hàng", icon: Users },
  { id: "craftsmen", label: "Thợ HandyGo", icon: Wrench },
  { id: "reviews", label: "Đánh giá", icon: Star },
  {
    id: "download",
    label: "Tải ứng dụng",
    icon: Smartphone,
  },
] as const;

export const Navbar: React.FC<NavbarProps> = ({ onOpenDownload }) => {
  const router = useRouter();
  const lenis = useLenis();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("");

  useEffect(() => {
    const handleScroll = () => {
      const sections = [
        "about",
        "customers",
        "craftsmen",
        "reviews",
        "download",
      ];

      const scrollPosition = window.scrollY + 140;
      let current = "";

      for (const id of sections) {
        const element = document.getElementById(id);

        if (element && element.offsetTop <= scrollPosition) {
          current = id;
        }
      }

      setActiveSection(current);
    };

    handleScroll();

    window.addEventListener("scroll", handleScroll, {
      passive: true,
    });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const handleScrollTo = (
    e: React.MouseEvent<HTMLAnchorElement>,
    targetId: string,
  ) => {
    e.preventDefault();
    setIsMobileMenuOpen(false);

    if (targetId === "download") {
      const downloadSection = document.getElementById("download");

      if (!downloadSection) {
        onOpenDownload();
        return;
      }
    }

    if (targetId === "top") {
      if (lenis) {
        lenis.scrollTo(0, { duration: 1.2 });
      } else {
        window.scrollTo({
          top: 0,
          behavior: "smooth",
        });
      }
      return;
    }

    const element = document.getElementById(targetId);
    if (!element) return;

    if (lenis) {
      lenis.scrollTo(element, {
        offset: -88,
        duration: 1.2,
      });
    } else {
      const top = element.getBoundingClientRect().top + window.scrollY - 88;

      window.scrollTo({
        top,
        behavior: "smooth",
      });
    }
  };

  const handleLogin = () => {
    setIsMobileMenuOpen(false);
    router.push("/login");
  };

  return (
    <>
      {/* HEADER */}
      <header className="fixed inset-x-0 top-0 z-50 w-full border-b border-slate-100 bg-white/95 shadow-sm backdrop-blur-md">
        <div className="mx-auto max-w-[1600px] px-4 sm:px-6 xl:px-8">
          <div className="flex h-[88px] items-center justify-between gap-5">
            {/* LOGO */}
            <a
              href="#top"
              onClick={(e) => handleScrollTo(e, "top")}
              aria-label="HandyGo - Trang chủ"
              className="flex shrink-0 items-center"
            >
              <Image
                src="/handygo-logo-horizontal.svg"
                alt="HandyGo"
                width={270}
                height={90}
                priority
                className="h-auto w-[190px] object-contain sm:w-[210px]"
              />
            </a>

            {/* DESKTOP MENU */}
            <nav className="hidden min-w-0 items-center justify-center gap-1 xl:flex 2xl:gap-1.5">
              {navLinks.map((link) => {
                const isActive = activeSection === link.id;

                const linkClass = `relative inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-xl px-2.5 py-3 text-[15px] font-extrabold transition-all duration-200 2xl:px-3 2xl:text-base ${
                  isActive
                    ? "bg-orange-50 text-[#FF5E14]"
                    : "text-slate-700 hover:bg-orange-50 hover:text-[#FF5E14]"
                }`;

                if ("href" in link && link.href) {
                  return (
                    <Link key={link.id} href={link.href} className={linkClass}>
                      {link.label}
                    </Link>
                  );
                }

                return (
                  <a
                    key={link.id}
                    href={`#${link.id}`}
                    onClick={(e) => handleScrollTo(e, link.id)}
                    className={linkClass}
                  >
                    {link.label}
                  </a>
                );
              })}
            </nav>

            {/* DESKTOP DOWNLOAD BUTTON */}
            <div className="hidden shrink-0 xl:flex">
              <button
                type="button"
                onClick={onOpenDownload}
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
                onClick={handleLogin}
                className="hidden whitespace-nowrap rounded-xl bg-[#FF5E14] px-4 py-2.5 text-base font-bold text-white sm:inline-flex"
              >
                Đăng nhập
              </button>

              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(true)}
                aria-label="Mở menu"
                aria-expanded={isMobileMenuOpen}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-800 transition-colors hover:bg-orange-50 hover:text-[#FF5E14]"
              >
                <Menu size={23} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* MOBILE DRAWER */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-[60] flex justify-end xl:hidden">
            {/* OVERLAY */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]"
            />

            {/* DRAWER */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{
                type: "spring",
                damping: 30,
                stiffness: 300,
              }}
              className="relative flex h-full w-[min(360px,85vw)] flex-col bg-white shadow-2xl"
            >
              {/* DRAWER HEADER */}
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-5">
                <Image
                  src="/handygo-logo-horizontal.svg"
                  alt="HandyGo"
                  width={200}
                  height={65}
                  className="h-auto w-[180px] object-contain"
                />

                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  aria-label="Đóng menu"
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 hover:bg-orange-50 hover:text-[#FF5E14]"
                >
                  <X size={21} />
                </button>
              </div>

              {/* DRAWER LINKS */}
              <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-5">
                <a
                  href="#top"
                  onClick={(e) => handleScrollTo(e, "top")}
                  className="flex items-center gap-3 rounded-xl px-4 py-3 text-base font-bold text-slate-700 hover:bg-orange-50 hover:text-[#FF5E14]"
                >
                  <Home size={19} />
                  Trang chủ
                </a>

                {navLinks.map((link) => {
                  const Icon = link.icon;

                  const content = (
                    <>
                      <Icon size={19} className="shrink-0" />

                      <span className="flex-1">{link.label}</span>

                      <ChevronRight size={16} className="text-slate-400" />
                    </>
                  );

                  const className =
                    "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-base font-bold text-slate-700 transition-colors hover:bg-orange-50 hover:text-[#FF5E14]";

                  if ("href" in link && link.href) {
                    return (
                      <Link
                        key={link.id}
                        href={link.href}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={className}
                      >
                        {content}
                      </Link>
                    );
                  }

                  return (
                    <a
                      key={link.id}
                      href={`#${link.id}`}
                      onClick={(e) => handleScrollTo(e, link.id)}
                      className={className}
                    >
                      {content}
                    </a>
                  );
                })}
              </nav>

              {/* DRAWER FOOTER */}
              <div className="border-t border-slate-100 bg-slate-50 p-5">
                <button
                  type="button"
                  onClick={handleLogin}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FF5E14] px-5 py-3.5 text-base font-extrabold text-white shadow-md shadow-orange-500/20 hover:bg-[#E9510D]"
                >
                  <LogIn size={18} />
                  Đăng nhập
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Navbar;
