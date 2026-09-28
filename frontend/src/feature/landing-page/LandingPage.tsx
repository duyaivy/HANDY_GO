"use client";

import React, { useState, useEffect } from "react";
import { ReactLenis, useLenis } from "lenis/react";
import "lenis/dist/lenis.css";

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
import { AuthModal } from "./components/AuthModal";
import type Lenis from "lenis";
declare global {
  interface Window {
    __handyGoLenis?: Lenis;
  }
}

function LenisSync() {
  const lenis = useLenis();

  useEffect(() => {
    if (lenis) {
      window .__handyGoLenis = lenis;
    }
  }, [lenis]);

  return null;
}

export default function LandingPage() {
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");

  const handleOpenDownload = () => {
    setIsDownloadModalOpen(true);
  };

  const handleCloseDownload = () => {
    setIsDownloadModalOpen(false);
  };

  const handleOpenAuth = (mode: "login" | "register") => {
    setAuthMode(mode);
    setIsAuthModalOpen(true);
  };

  const handleCloseAuth = () => {
    setIsAuthModalOpen(false);
  };

  return (
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

        <Navbar
          onOpenDownload={handleOpenDownload}
          onOpenAuth={handleOpenAuth}
        />

        <main>
          <HeroSection
            onOpenDownload={handleOpenDownload}
            onOpenAuth={handleOpenAuth}
          />

          <AboutSection />

          <CustomerSection
            onOpenDownload={handleOpenDownload}
          />

          <CraftsmanSection />

          <Testimonials />

          <DownloadCTA
            onOpenDownload={handleOpenDownload}
          />
        </main>

        <Footer
          onOpenDownload={handleOpenDownload}
          onOpenAuth={handleOpenAuth}
        />

        <FloatingWidget
          onOpenDownload={handleOpenDownload}
        />

        <DownloadModal
          isOpen={isDownloadModalOpen}
          onClose={handleCloseDownload}
        />

        <AuthModal
          isOpen={isAuthModalOpen}
          initialMode={authMode}
          onClose={handleCloseAuth}
        />

      </div>
    </ReactLenis>
  );
}