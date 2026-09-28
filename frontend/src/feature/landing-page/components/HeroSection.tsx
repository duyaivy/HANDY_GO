import React from 'react';
import {
  Smartphone,
  ShieldCheck,
  Star,
  Clock,
  
  ArrowRight,

  LogIn,
} from 'lucide-react';
import { motion } from 'motion/react';
import { PhoneMockup } from './PhoneMockup';

interface HeroSectionProps {
  onOpenDownload: () => void;
  onOpenAuth: (mode: 'login' | 'register') => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ onOpenDownload, onOpenAuth }) => {
  return (
    <section className="relative pt-32 pb-16 lg:pt-40 lg:pb-24 overflow-hidden bg-white">
      {/* Subtle background ambient circles & glow with motion */}
      <motion.div
        animate={{
          scale: [1, 1.08, 1],
          opacity: [0.35, 0.5, 0.35],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute top-10 left-1/2 -translate-x-1/2 w-250 h-150 bg-linear-to-b from-orange-100/40 via-orange-50/20 to-transparent rounded-full blur-3xl -z-10 pointer-events-none"
      />
      <div className="absolute -top-24 right-0 w-96 h-96 bg-orange-200/25 rounded-full blur-3xl -z-10 pointer-events-none" />
      <div className="absolute top-1/2 left-0 w-80 h-80 bg-amber-100/30 rounded-full blur-3xl -z-10 pointer-events-none" />

      {/* Grid pattern background subtle */}
      <div className="absolute inset-0 bg-grid-subtle opacity-40 pointer-events-none -z-10" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Left Column: Brand Message & Mobile-First Highlights */}
          <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
            {/* Live Online Badge with subtle spring entrance */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-orange-50 border border-orange-200/80 shadow-xs"
            >
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF5E14] opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#FF5E14]" />
              </span>
              <span className="text-xs sm:text-sm font-bold text-slate-800">
                1.480+ thợ chuyên nghiệp đang trực tuyến sẵn sàng nhận đơn
              </span>
            </motion.div>

            {/* Main Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1, ease: 'easeOut' }}
              className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-[1.12]"
            >
              Thợ Sửa Chữa Tận Nhà.{' '}
              <span className="block mt-1 text-[#FF5E14]">
                Đặt 60s Trên Điện Thoại.
              </span>
            </motion.h1>

            {/* Value Proposition Description */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
              className="text-lg sm:text-xl text-slate-600 max-w-2xl font-normal leading-relaxed mx-auto lg:mx-0"
            >
              Chỉ với vài chạm trên ứng dụng di động Handy Go, hệ thống tự động kết nối thợ điện, nước, máy lạnh, sửa khóa lành nghề gần nhất. <strong className="text-slate-900 font-semibold">Có mặt sau 15 phút, theo dõi GPS trực tiếp, tay nghề kiểm định 100%.</strong>
            </motion.p>

            {/* Mobile App Callout Note */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3, ease: 'easeOut' }}
              whileHover={{ scale: 1.01 }}
              className="p-4 sm:p-5 rounded-2xl bg-amber-50/80 border border-amber-200/90 max-w-xl mx-auto lg:mx-0 flex items-start gap-3.5 text-left shadow-2xs"
            >
              <div className="w-10 h-10 rounded-xl bg-[#FF5E14] text-white flex items-center justify-center shrink-0 shadow-xs">
                <Smartphone className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <p className="font-black text-slate-900 text-sm sm:text-base">
                  Dịch vụ độc quyền đặt qua ứng dụng di động Handy Go
                </p>
                <p className="text-slate-600 text-xs sm:text-sm leading-relaxed font-normal">
                  Để đảm bảo theo dõi GPS thời gian thực, bảo mật lý lịch thợ và ghép nối chuyên viên gần nhất an toàn tuyệt đối cho gia đình bạn.
                </p>
              </div>
            </motion.div>

            {/* CTAs and Download Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4, ease: 'easeOut' }}
              className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-2"
            >
              {/* Primary Action Button */}
              <motion.button
                type="button"
                onClick={onOpenDownload}
                whileHover={{ scale: 1.03, y: -2 }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-linear-to-r from-[#FF5E14] via-[#FF6F22] to-[#FFA048] text-white font-black text-base shadow-xl orange-glow hover:shadow-orange-500/50 transition-all flex items-center justify-center gap-3"
              >
                <Smartphone className="w-5 h-5" />
                <span>Tải App Handy Go</span>
                <ArrowRight className="w-5 h-5" />
              </motion.button>

              {/* Login Quick Button */}
              <motion.button
                type="button"
                onClick={() => onOpenAuth('login')}
                whileHover={{ scale: 1.02, y: -1 }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className="w-full sm:w-auto px-7 py-4 rounded-2xl bg-white border border-slate-200 hover:border-orange-300 hover:bg-orange-50/40 text-slate-800 font-extrabold text-base shadow-sm transition-all flex items-center justify-center gap-2.5"
              >
                <LogIn className="w-5 h-5 text-[#FF5E14]" />
                <span>Đăng Nhập Tài Khoản</span>
              </motion.button>
            </motion.div>

            {/* App Store Icons & Social Proof */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.5 }}
              className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-center lg:justify-start gap-6 text-xs text-slate-500"
            >
              <div className="flex items-center gap-2.5">
                <div className="flex -space-x-1.5">
                  <img
                    className="w-9 h-9 rounded-full border-2 border-white object-cover shadow-xs"
                    src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80"
                    alt="Khách hàng"
                  />
                  <img
                    className="w-9 h-9 rounded-full border-2 border-white object-cover shadow-xs"
                    src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80"
                    alt="Khách hàng"
                  />
                  <img
                    className="w-9 h-9 rounded-full border-2 border-white object-cover shadow-xs"
                    src="https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&auto=format&fit=crop&q=80"
                    alt="Khách hàng"
                  />
                  <div className="w-9 h-9 rounded-full border-2 border-white bg-[#FF5E14] text-white flex items-center justify-center font-black text-xs shadow-xs">
                    +120k
                  </div>
                </div>
                <div className="text-left">
                  <div className="flex items-center text-amber-500">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star key={i} className="w-4 h-4 fill-amber-400" />
                    ))}
                    <span className="ml-1.5 font-black text-slate-900 text-sm">4.9/5</span>
                  </div>
                  <span className="text-xs text-slate-500 font-medium">
                    Từ 128.000+ hộ gia đình tin dùng
                  </span>
                </div>
              </div>

              <div className="h-6 w-px bg-slate-200 hidden sm:block" />

              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-6 h-6 text-emerald-600" />
                <div className="text-left">
                  <p className="font-black text-slate-900 text-sm">Xác Minh CCCD 100%</p>
                  <p className="text-xs text-slate-500 font-medium">Lý lịch thợ trong sạch</p>
                </div>
              </div>

              <div className="h-6 w-px bg-slate-200 hidden sm:block" />

              <div className="flex items-center gap-2.5">
                <Clock className="w-6 h-6 text-[#FF5E14]" />
                <div className="text-left">
                  <p className="font-black text-slate-900 text-sm">15 Phút Có Mặt</p>
                  <p className="text-xs text-slate-500 font-medium">Thợ đến ngay khi nhận đơn</p>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Right Column: High-End Interactive Phone Showcase */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-5 relative flex justify-center"
          >
            {/* Interactive Phone Simulation */}
            <div className="relative z-10 w-full max-w-md flex justify-center">
              <PhoneMockup initialScreen="booking" />
            </div>

            {/* Floating feature pills around the phone with smooth animation */}
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
              whileHover={{ scale: 1.06 }}
              className="hidden sm:flex absolute -left-8 top-24 bg-white/95 backdrop-blur-md p-3.5 rounded-2xl shadow-xl border border-slate-100 items-center gap-3.5 z-20 cursor-default"
            >
              <div className="w-11 h-11 rounded-xl bg-orange-100 flex items-center justify-center text-[#FF5E14]">
                <Clock className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="text-xs text-slate-500 font-semibold">Tốc độ điều phối</p>
                <p className="text-sm font-black text-slate-900">Ghép thợ sau 60 giây</p>
              </div>
            </motion.div>

            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
              whileHover={{ scale: 1.06 }}
              className="hidden sm:flex absolute -right-8 bottom-28 bg-white/95 backdrop-blur-md p-3.5 rounded-2xl shadow-xl border border-slate-100 items-center gap-3.5 z-20 cursor-default"
            >
              <div className="w-11 h-11 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="text-xs text-slate-500 font-semibold">An tâm tuyệt đối</p>
                <p className="text-sm font-black text-slate-900">Thợ có thẻ & đồng phục</p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};
