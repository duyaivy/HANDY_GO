"use client";
import React, { useState } from "react";
import { ReactLenis, useLenis } from "lenis/react";
import { motion, AnimatePresence } from "motion/react";
import "lenis/dist/lenis.css";
import LoginForm from "../auth/component/LoginForm";
import { Navbar } from "./components/Navbar";
import { HeroSection } from "./components/HeroSection";
import { AboutSection } from "./components/AboutSection";
import { CustomerSection } from "./components/CustomerSection";
import { CraftsmanSection } from "./components/CraftsmanSection";
import { Testimonials } from "./components/Testimonials";
import { DownloadCTA } from "./components/DownloadCTA";
import { Footer } from "./components/Footer";
import { FloatingWidget } from "./components/FloatingWidget";
import { DownloadModal } from "./components/DownloadModal";

// Import all sub-components belonging to landing-page feature

type AuthModalMode = "login" | "register";

export interface LandingPageProps {
  onNavigateToAuth?: (mode?: AuthModalMode) => void;
}

declare global {
  interface Window {
    __handyGoLenis?: ReturnType<typeof useLenis>;
  }
}
// Helper component syncs Lenis instance to global window for instant access
function LenisSync() {
  const lenis = useLenis();
  React.useEffect(() => {
    if (lenis) {
      window.__handyGoLenis = lenis;
    }
  }, [lenis]);
  return null;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onNavigateToAuth,
}) => {
  // =========================================================================
  // TOÀN BỘ STATE VÀ SỰ KIỆN NÚT BẤM ĐƯỢC TẬP TRUNG TẠI ĐÂY (LandingPage.tsx)
  // =========================================================================
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [isLoginActive, setIsLoginActive] = useState(false);

  // 1. Sự kiện mở popup tải App
  const handleOpenDownload = () => {
    setIsDownloadModalOpen(true);
  };

  // 2. Sự kiện đóng popup tải App
  const handleCloseDownload = () => {
    setIsDownloadModalOpen(false);
  };

  // 3. Sự kiện bấm nút Đăng nhập / Đăng ký
  const handleOpenAuth = (mode: AuthModalMode = "login") => {
    if (onNavigateToAuth) {
      onNavigateToAuth(mode);
    } else {
      window.scrollTo({ top: 0, behavior: "instant" });
      setIsLoginActive(true);
    }
  };

  // 4. Quay lại trang chủ từ giao diện Đăng nhập
  const handleBackToHome = () => {
    window.scrollTo({ top: 0, behavior: "instant" });
    setIsLoginActive(false);
  };

  return (
    <AnimatePresence mode="wait">
      {isLoginActive ? (
        <motion.div
          key="login-view"
          initial={{ opacity: 0, scale: 0.98, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: -15 }}
          transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
          className="min-h-screen w-full bg-white"
        >
          <LoginForm onBackToHome={handleBackToHome} />
        </motion.div>
      ) : (
        <motion.div
          key="landing-view"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 0.99, y: 10 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        >
          <ReactLenis
            root
            options={{
              lerp: 0.1,
              duration: 1.4,
              smoothWheel: true,
              respectReducedMotion: false,
              autoRaf: true,
            }}
          >
            <LenisSync />
            <div className="min-h-screen bg-white text-slate-900 selection:bg-[#FF5E14] selection:text-white">
              {/* Sticky Header */}
              <Navbar onOpenDownload={handleOpenDownload} />

              {/* Nội dung chính của Landing Page */}
              <main>
                {/* Hero Section */}
                <HeroSection
                  onOpenDownload={handleOpenDownload}
                  onOpenAuth={handleOpenAuth}
                />

                {/* 1. Về chúng tôi */}
                <AboutSection />

                {/* 2. Khách hàng */}
                <CustomerSection onOpenDownload={handleOpenDownload} />

                {/* 3. Thợ Handy Go */}
                <CraftsmanSection />

                {/* 4. Đánh giá khách hàng */}
                <Testimonials />

                {/* 5. Download App CTA */}
                <DownloadCTA onOpenDownload={handleOpenDownload} />
              </main>

              {/* Footer */}
              <Footer onOpenDownload={handleOpenDownload} />

              {/* Nút Hotline 24/7 và tải app nổi */}
              <FloatingWidget onOpenDownload={handleOpenDownload} />

              {/* Modal tải App HandyGo với mã QR */}
              <DownloadModal
                isOpen={isDownloadModalOpen}
                onClose={handleCloseDownload}
              />
            </div>
          </ReactLenis>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
export default LandingPage;
