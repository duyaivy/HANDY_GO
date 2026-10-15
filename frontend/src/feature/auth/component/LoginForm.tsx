"use client";
import React, { useState } from "react";
import { Eye, EyeOff, ArrowLeft, Mail, Lock } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";

export interface LoginFormProps {
  /** Đường dẫn file logo để bạn có thể tự đổi tên hoặc thay đổi file ảnh */
  logoSrc?: string;
  /** Đường dẫn file ảnh minh họa ở bên trái */
  bannerImageSrc?: string;
  onSuccess?: () => void;
  onSwitchToRegister?: () => void;
  onBackToHome?: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({
  // 👉 BẠN CÓ THỂ ĐỔI TÊN HOẶC ĐƯỜNG DẪN ẢNH LOGO TẠI ĐÂY:
  logoSrc = "/handygo-logo.svg",
  // 👉 BẠN CÓ THỂ ĐỔI TÊN HOẶC ĐƯỜNG DẪN ẢNH MINH HỌA TẠI ĐÂY:
  bannerImageSrc = "/banner.png",

  onSuccess,
  onSwitchToRegister,
  onBackToHome,
}) => {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember30Days, setRemember30Days] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      if (onSuccess) {
        onSuccess();
      } else {
        router.push("/manager/dashboard");
      }
    }, 600);
  };

  const handleGoogleLogin = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      if (onSuccess) {
        onSuccess();
      } else {
        router.push("/manager/dashboard");
      }
    }, 600);
  };

  return (
    <div className="relative h-screen w-full bg-white font-sans text-slate-800 selection:bg-orange-100 selection:text-orange-900 overflow-hidden flex items-center justify-center">
      {/* ================= BACKGROUND LƯỢN SÓNG CAM UỐN LƯỢN NHIỀU HƠN ================= */}
      <div className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden z-0">
        <svg
          className="w-full h-full"
          viewBox="0 0 1440 900"
          preserveAspectRatio="none"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Đốm màu pastel kem mềm mại làm nền cho hình ảnh minh họa bên trái */}
          <path
            d="M 120 480 C 60 280 220 140 400 170 C 580 200 680 340 640 540 C 600 730 420 770 260 720 C 150 680 130 570 120 480 Z"
            fill="#FFF2E2"
            opacity="0.85"
          />

          {/* Lớp sóng phụ mờ màu cam nhạt tạo chiều sâu và độ cong đa tầng */}
          <path
            d="M 980 0 C 1040 160 880 260 760 380 C 630 500 480 490 320 620 C 190 730 90 790 0 830 L 0 900 L 1440 900 L 1440 0 Z"
            fill="#FCA846"
            opacity="0.4"
          />

          {/* Dải sóng chính màu cam vàng uốn lượn cong sâu và mềm mại hơn */}
          <path
            d="M 920 0 C 970 190 850 310 740 420 C 620 540 420 530 260 670 C 140 770 70 820 0 870 L 0 900 L 1440 900 L 1440 0 Z"
            fill="#F79A38"
          />

          {/* Điểm nhấn vòm sóng đáy phụ bên trái tạo nhịp điệu uốn lượn */}
          <path
            d="M 0 760 C 140 760 260 840 380 900 L 0 900 Z"
            fill="#F79A38"
            opacity="0.75"
          />
        </svg>
      </div>

      {/* ================= KHUNG NỘI DUNG CHÍNH (VỪA KHÍT 1 MÀN HÌNH 100VH) ================= */}
      <div className="relative z-10 w-full max-w-345 h-full max-h-[96vh] flex flex-col justify-between p-4 sm:p-6 lg:p-8">
        {/* THANH TOP HEADER: NÚT QUAY LẠI VÀ LOGO */}
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            {/* Nút quay lại Landing Page */}
            {/* <button
              type="button"
              onClick={(e) => {
                if (onBackToHome) {
                  e.preventDefault();
                  onBackToHome();
                } else {
                  router.push("/");
                }
              }}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/90 backdrop-blur-sm border border-slate-200/80 shadow-xs hover:shadow-md text-slate-700 hover:text-[#FF5E14] hover:border-orange-300 flex items-center justify-center transition-all cursor-pointer group active:scale-95 shrink-0"
              title="Quay lại trang chủ"
              aria-label="Quay lại trang chủ"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 transition-transform group-hover:-translate-x-0.5" />
            </button> */}

            {/* 👉 KHU VỰC LOGO: Bạn có thể đổi tên file ảnh tại biến logoSrc hoặc thuộc tính src="/handygo-logo.svg" */}
            <Link
              href="/"
              onClick={(e) => {
                if (onBackToHome) {
                  e.preventDefault();
                  onBackToHome();
                }
              }}
              className="flex items-center gap-2 cursor-pointer select-none group"
              title="HandyGo"
            >
              <Image
                src={logoSrc}
                alt="HandyGo Logo"
                width={150}
                height={40}
                className="h-19 sm:h-22 w-auto max-w-37.5 object-contain select-none drop-shadow-xs"
              />
            </Link>
          </div>

          {/* <div className="text-xs font-semibold text-slate-500 bg-white/70 backdrop-blur-xs px-3.5 py-1.5 rounded-full border border-slate-200/60 hidden sm:block">
            Hỗ trợ khách hàng:{" "}
            <span className="text-[#F79A38] font-bold">1900 6868</span>
          </div> */}
        </div>

        {/* THÂN GIỮA: CỘT TRÁI (HÌNH ẢNH THỢ) & CỘT PHẢI (FORM CARD ĐĂNG NHẬP) */}
        <div className="my-auto w-full flex-1 flex flex-col lg:flex-row items-center justify-between gap-6 lg:gap-12 py-2 min-h-0">
          {/* ================= CỘT TRÁI: HÌNH ẢNH MINH HỌA ================= */}
          <motion.div
            initial={{ opacity: 0, x: -25 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="w-full lg:w-[50%] flex flex-col items-center justify-center p-2 sm:p-4"
          >
            <div className="relative w-full max-w-[1000px] flex items-center justify-center">
              <div className="relative w-full flex items-center justify-center -translate-x-12 -translate-y-24 transition-transform hover:scale-[1.01]">
                <img
                  src={bannerImageSrc}
                  alt="Handy Service"
                  onError={(e) => {
                    e.currentTarget.src =
                      "/handyservice_flat_bg_FA984D_fixed.png";
                  }}
                  className="w-full h-auto max-h-[350px] sm:max-h-[400px] lg:max-h-[440px] object-contain select-none drop-shadow-md"
                />
              </div>
            </div>
          </motion.div>

          {/* ================= CỘT PHẢI: FORM CARD TRẮNG NỔI TRÊN NỀN CAM ================= */}
          <motion.div
            initial={{ opacity: 0, x: 25 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="w-full lg:w-[48%] xl:w-[45%] flex flex-col items-center lg:items-end justify-center"
          >
            {/* THẺ TRẮNG CHỨA FORM (Kích thước to hơn, bo góc mềm mại, sang trọng) */}
            <div className="w-full max-w-120 xl:max-w-125 bg-white rounded-3xl sm:rounded-[36px] shadow-2xl shadow-orange-950/20 border border-white/70 p-7 sm:p-9 lg:p-10">
              {/* TIÊU ĐỀ "Welcome Back" NGHỆ THUẬT */}
              <div className="text-center mb-6 sm:mb-7">
                <h1 className="text-3xl sm:text-4xl font-black text-[#F79A38] tracking-tight italic font-serif leading-tight">
                  Welcome Back
                </h1>
                <p className="text-xs sm:text-sm text-slate-400 mt-1.5 font-medium">
                  Vui lòng đăng nhập vào tài khoản HandyGo
                </p>
              </div>

              {/* FORM NHẬP THÔNG TIN */}
              <form
                onSubmit={handleSubmit}
                className="space-y-4 sm:space-y-4.5"
              >
                {/* FIELD EMAIL */}
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5 text-left">
                    Email hoặc Tên đăng nhập
                  </label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                      <Mail className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="vidu@handygo.vn"
                      required
                      className="w-full pl-11 pr-4 py-3 sm:py-3.5 bg-slate-50/80 hover:bg-white focus:bg-white border border-slate-200 focus:border-[#F79A38] rounded-2xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all shadow-2xs"
                    />
                  </div>
                </div>

                {/* FIELD PASSWORD */}
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5 text-left">
                    Mật khẩu
                  </label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                      <Lock className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      className="w-full pl-11 pr-11 py-3 sm:py-3.5 bg-slate-50/80 hover:bg-white focus:bg-white border border-slate-200 focus:border-[#F79A38] rounded-2xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all tracking-wider shadow-2xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none p-1 transition-colors cursor-pointer"
                      aria-label={
                        showPassword ? "Ẩn mật khẩu" : "Hiển thị mật khẩu"
                      }
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4 sm:w-5 sm:h-5" />
                      ) : (
                        <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* GHI NHỚ VÀ QUÊN MẬT KHẨU */}
                <div className="flex items-center justify-between pt-0.5">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={remember30Days}
                      onChange={(e) => setRemember30Days(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-[#F79A38] focus:ring-[#F79A38] accent-[#F79A38] cursor-pointer"
                    />
                    <span className="text-xs sm:text-[13px] text-slate-600 font-medium">
                      Ghi nhớ đăng nhập
                    </span>
                  </label>

                  <a
                    href="/forgot-password"
                    className="text-xs sm:text-[13px] font-semibold text-[#F79A38] hover:text-[#d97c1d] hover:underline transition-colors"
                  >
                    Quên mật khẩu?
                  </a>
                </div>

                {/* NÚT ĐĂNG NHẬP MÀU VÀNG CAM BO TRÒN THEO ẢNH MẪU */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3.5 sm:py-4 px-6 rounded-2xl bg-[#F79A38] hover:bg-[#e68826] active:scale-[0.99] text-white font-bold text-sm sm:text-base shadow-lg shadow-orange-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-70 cursor-pointer mt-2"
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <span>Đăng nhập</span>
                  )}
                </button>
              </form>

              {/* DÒNG PHÂN CÁCH HOẶC */}
              <div className="relative my-5 flex items-center justify-center">
                <div className="border-t border-slate-200 w-full" />
                <span className="absolute bg-white px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  HOẶC
                </span>
              </div>

              {/* NÚT ĐĂNG NHẬP GOOGLE (ĐẶT Ở DƯỚI CÙNG THEO YÊU CẦU) */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                className="w-full py-3 sm:py-3.5 px-4 border border-slate-200 hover:border-slate-300 hover:bg-slate-50/80 rounded-2xl text-xs sm:text-sm font-semibold text-slate-700 flex items-center justify-center gap-3 transition-all shadow-xs active:scale-[0.99] cursor-pointer"
              >
                <svg
                  className="w-4 h-4 sm:w-5 sm:h-5 shrink-0"
                  viewBox="0 0 24 24"
                >
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Đăng nhập với Google</span>
              </button>
            </div>

            {/* DÒNG FOOTER DƯỚI CARD NẰM TRÊN NỀN CAM (Đúng theo ảnh mẫu) */}
            <div className="w-full max-w-[480px] xl:max-w-[500px] text-center lg:text-left mt-3.5 space-y-1 text-white/95 text-xs sm:text-[13px] font-medium drop-shadow-xs">
              {/* <div>
                Cần hỗ trợ?{" "}
                <span className="font-bold underline cursor-pointer hover:text-white">
                  Hotline 1900 6868
                </span>
              </div> */}
              <div>
                Chưa có tài khoản?{" "}
                {onSwitchToRegister ? (
                  <button
                    type="button"
                    onClick={onSwitchToRegister}
                    className="font-bold text-white underline hover:text-amber-100 cursor-pointer"
                  >
                    Đăng ký ngay
                  </button>
                ) : (
                  <a
                    href="/register"
                    className="font-bold text-white underline hover:text-amber-100"
                  >
                    Đăng ký ngay
                  </a>
                )}
              </div>
            </div>
          </motion.div>
        </div>

        {/* COPYRIGHT CHÂN TRANG */}
        <div className="shrink-0 text-center text-[11px] text-slate-400">
          © {new Date().getFullYear()} HandyGo Inc. Tiện ích sửa chữa tận tâm.
        </div>
      </div>
    </div>
  );
};

export default LoginForm;
