import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Wrench,
  Zap,
  Droplets,
  Wind,
  Key,
  ShieldCheck,
  Star,
  
  Clock,
  PhoneCall,
  CheckCircle2,
  ChevronRight,
  Sparkles,
  Navigation,
  ArrowRight,
  Play,
  Pause,

} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface PhoneMockupProps {
  initialScreen?: 'booking' | 'tracking' | 'review';
  compact?: boolean;
}

const SCREENS = ['booking', 'tracking', 'review'] as const;
type ScreenId = (typeof SCREENS)[number];

const AUTO_ROTATE_DURATION = 4000; // 4 seconds per screen

export const PhoneMockup: React.FC<PhoneMockupProps> = ({
  initialScreen = 'booking',
  compact = false,
}) => {
  const [activeScreen, setActiveScreen] = useState<ScreenId>(initialScreen);
  const [selectedService, setSelectedService] = useState('dien-lanh');
  const [currentTime, setCurrentTime] = useState('09:41');
  const [isAutoPlay, setIsAutoPlay] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [progress, setProgress] = useState(0);

  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const mins = String(now.getMinutes()).padStart(2, '0');
      setCurrentTime(`${hours}:${mins}`);
    };
    updateTime();
  }, []);

  const handleScreenChange = useCallback((screen: ScreenId) => {
    setActiveScreen(screen);
    setProgress(0);
    startTimeRef.current = Date.now();
  }, []);

  const handleNextScreen = useCallback(() => {
    setActiveScreen((prev) => {
      const currentIndex = SCREENS.indexOf(prev);
      const nextIndex = (currentIndex + 1) % SCREENS.length;
      return SCREENS[nextIndex];
    });
    setProgress(0);
    startTimeRef.current = Date.now();
  }, []);

  // Smooth RAF loop for auto-rotation and progress bar
  useEffect(() => {
    if (!isAutoPlay || isHovered) {
      if (timerRef.current) cancelAnimationFrame(timerRef.current);
      return;
    }

    startTimeRef.current = Date.now() - (progress / 100) * AUTO_ROTATE_DURATION;

    const tick = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const currentProgress = Math.min((elapsed / AUTO_ROTATE_DURATION) * 100, 100);
      setProgress(currentProgress);

      if (elapsed >= AUTO_ROTATE_DURATION) {
        handleNextScreen();
      } else {
        timerRef.current = requestAnimationFrame(tick);
      }
    };

    timerRef.current = requestAnimationFrame(tick);

    return () => {
      if (timerRef.current) cancelAnimationFrame(timerRef.current);
    };
  }, [isAutoPlay, isHovered, activeScreen, handleNextScreen]);

  return (
    <div
      className="relative mx-auto flex flex-col items-center w-full max-w-sm sm:max-w-md px-1"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchStart={() => setIsHovered(true)}
      onTouchEnd={() => {
        // Resume after 2.5s touch idle
        setTimeout(() => setIsHovered(false), 2500);
      }}
    >
      {/* Screen Selection Tabs above phone with smooth active pill indicator and auto-rotation progress */}
      <div className="w-full mb-4 space-y-2">
        <div className="flex items-center justify-between gap-1 p-1 sm:p-1.5 bg-slate-100/95 backdrop-blur-md rounded-2xl border border-slate-200/90 shadow-sm relative">
          {(
            [
              { id: 'booking', label: '1. Đặt Thợ 60s' },
              { id: 'tracking', label: '2. GPS 15 Phút' },
              { id: 'review', label: '3. Đánh Giá' },
            ] as const
          ).map((tab) => {
            const isActive = activeScreen === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleScreenChange(tab.id)}
                className={`relative flex-1 py-2 sm:py-2.5 px-2 rounded-xl text-xs sm:text-sm font-bold transition-all text-center z-10 overflow-hidden cursor-pointer ${
                  isActive ? 'text-white' : 'text-slate-700 hover:text-slate-900'
                }`}
                title={tab.label}
              >
                {isActive && (
                  <motion.div
                    layoutId="activePhoneTab"
                    className="absolute inset-0 bg-[#FF5E14] rounded-xl shadow-sm -z-10"
                    transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                  />
                )}
                {/* Active tab auto-switch progress bar */}
                {isActive && isAutoPlay && !isHovered && (
                  <div
                    className="absolute bottom-0 left-0 h-1 bg-white/50 rounded-full transition-all"
                    style={{ width: `${progress}%` }}
                  />
                )}
                <span className="relative z-10 whitespace-nowrap block truncate">
                  {tab.label}
                </span>
              </button>
            );
          })}

          {/* Auto-play toggle button */}
          <button
            type="button"
            onClick={() => setIsAutoPlay(!isAutoPlay)}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-200/80 transition-colors shrink-0"
            title={isAutoPlay ? 'Tạm dừng tự động chuyển' : 'Bật tự động chuyển'}
            aria-label={isAutoPlay ? 'Tạm dừng tự động chuyển' : 'Bật tự động chuyển'}
          >
            {isAutoPlay && !isHovered ? (
              <Pause className="w-3.5 h-3.5" />
            ) : (
              <Play className="w-3.5 h-3.5 text-[#FF5E14]" />
            )}
          </button>
        </div>

        {/* Small subtle status notice */}
        <div className="flex items-center justify-between px-2 text-[11px] text-slate-500 font-medium">
          <span className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                isAutoPlay && !isHovered ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'
              }`}
            />
            {isAutoPlay && !isHovered
              ? 'Tự động chuyển mỗi 4s'
              : isHovered
              ? 'Đang dừng để bạn xem chi tiết'
              : 'Đã tạm dừng tự động'}
          </span>
          <span className="text-slate-400 hidden sm:inline">Chạm hoặc rê chuột để giữ</span>
        </div>
      </div>

      {/* Titanium Frame Wrapper with smooth floating animation */}
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        className={`relative ${
          compact
            ? 'w-72.5 xs:w-[310px] h-147.5 xs:h-[610px]'
            : 'w-73.75 xs:w-[335px] sm:w-92.5 h-160 xs:h-[670px] sm:h-177.5'
        } bg-slate-950 p-2.25 xs:p-[11px] rounded-[48px] xs:rounded-[52px] ring-1 ring-slate-800 shadow-2xl phone-shadow transition-all mx-auto`}
      >
        {/* Subtle Outer Metal Highlights */}
        <div className="absolute inset-0 rounded-[52px] border-[3px] border-slate-700/60 pointer-events-none" />
        <div className="absolute -left-0.75 top-28.75 w-0.75 h-7 bg-slate-700 rounded-l-sm" />
        <div className="absolute -left-0.75 top-38.75 w-0.75 h-12 bg-slate-700 rounded-l-sm" />
        <div className="absolute -left-0.75 top-53.75 w-0.75 h-12 bg-slate-700 rounded-l-sm" />
        <div className="absolute -right-0.75 top-35 w-0.75 h-16 bg-slate-700 rounded-r-sm" />

        {/* Screen Bezel and Inner Display */}
        <div className="relative w-full h-full bg-white rounded-[44px] overflow-hidden flex flex-col select-none text-slate-800 font-sans shadow-inner">
          {/* iOS Dynamic Island Header */}
          <div className="relative pt-3 px-6 pb-2 flex items-center justify-between z-30 bg-white">
            <span className="text-xs font-black text-slate-900 tracking-tight">
              {currentTime}
            </span>
            <div className="w-24 h-5 bg-black rounded-full flex items-center justify-end px-2.5 space-x-1.5 shadow-sm">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <div className="w-2.5 h-2.5 rounded-full bg-slate-800" />
            </div>
            <div className="flex items-center gap-1.5 text-slate-900">
              <span className="text-[11px] font-black">5G</span>
              <div className="w-5 h-2.5 border border-slate-900 rounded-xs p-0.5 flex items-center">
                <div className="w-full h-full bg-slate-900 rounded-2xs" />
              </div>
            </div>
          </div>

          {/* Screen Content Container with Smooth Transition */}
          <div className="flex-1 overflow-y-auto px-4 pt-1 pb-20 no-scrollbar relative">
            <AnimatePresence mode="wait">
              {/* SCREEN 1: INSTANT BOOKING */}
              {activeScreen === 'booking' && (
                <motion.div
                  key="booking"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                  className="space-y-4"
                >
                  {/* User greeting & live status */}
                  <div className="flex items-center justify-between pt-1">
                    <div>
                      <span className="text-xs text-slate-500 font-semibold">Chào bạn,</span>
                      <h4 className="text-sm sm:text-base font-black text-slate-900 leading-tight">
                        Cần gọi thợ ngay bây giờ?
                      </h4>
                    </div>
                    <img
                      src="/handygo-app-icon.svg"
                      alt="HandyGo"
                      className="w-9 h-9 rounded-xl object-contain shadow-xs"
                    />
                  </div>

                  {/* Promo Banner inside App with shimmering gradient */}
                  <div className="bg-linear-to-r from-[#FF5E14] to-[#FF8A34] text-white p-3.5 rounded-2xl shadow-sm relative overflow-hidden">
                    <div className="relative z-10">
                      <span className="inline-block bg-white/20 px-2.5 py-0.5 rounded-full text-xs font-black tracking-wider uppercase mb-1">
                        Ưu đãi người dùng mới
                      </span>
                      <h4 className="text-base font-black leading-snug">
                        Giảm 50.000đ khi đặt lần đầu
                      </h4>
                      <p className="text-xs text-white/95 mt-1 font-medium">
                        Mã:{' '}
                        <span className="font-mono font-black bg-white text-[#FF5E14] px-2 py-0.5 rounded-md text-xs">
                          HANDYGO50
                        </span>
                      </p>
                    </div>
                    <Sparkles className="absolute -right-2 -bottom-2 w-16 h-16 text-white/20 animate-spin-slow" />
                  </div>

                  {/* Popular Services Quick Select */}
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <h5 className="text-sm font-black text-slate-900">Chọn dịch vụ cần thợ</h5>
                      <span className="text-xs text-[#FF5E14] font-bold">Xem tất cả</span>
                    </div>

                    <div className="grid grid-cols-3 gap-2.5">
                      {[
                        { id: 'dien-lanh', label: 'Điện lạnh', icon: Wind },
                        { id: 'dien-nuoc', label: 'Điện nước', icon: Zap },
                        { id: 'ong-nuoc', label: 'Ống nước', icon: Droplets },
                        { id: 'khoa', label: 'Sửa khóa', icon: Key },
                        { id: 'sua-chua', label: 'Gia dụng', icon: Wrench },
                        { id: 'khac', label: 'Nội thất', icon: Sparkles },
                      ].map((item) => (
                        <motion.button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedService(item.id)}
                          whileHover={{ scale: 1.04 }}
                          whileTap={{ scale: 0.94 }}
                          transition={{ type: 'spring', stiffness: 450, damping: 25 }}
                          className={`p-3 rounded-2xl border flex flex-col items-center justify-center text-center transition-all ${
                            selectedService === item.id
                              ? 'border-[#FF5E14] bg-orange-50/80 shadow-xs ring-1 ring-[#FF5E14]'
                              : 'border-slate-100 bg-slate-50/70 hover:bg-slate-100'
                          }`}
                        >
                          <item.icon className="w-6 h-6 mb-1.5 text-[#FF5E14]" />
                          <span className="text-xs font-bold text-slate-800">{item.label}</span>
                        </motion.button>
                      ))}
                    </div>
                  </div>

                  {/* Urgent Request Card */}
                  <div className="border border-slate-200/90 rounded-2xl p-3.5 bg-white space-y-2.5 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs sm:text-sm font-black text-slate-900">Mô tả sự cố</span>
                      <span className="text-xs text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded-md">
                        Có mặt ~15 phút
                      </span>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-2.5 text-xs sm:text-sm text-slate-700 border border-slate-100 leading-relaxed">
                      Máy lạnh phòng ngủ chảy nước và kém lạnh, cần thợ qua kiểm tra gấp.
                    </div>
                    <div className="flex items-center gap-2 pt-1 text-xs text-slate-600">
                      <Clock className="w-4 h-4 text-[#FF5E14] shrink-0" />
                      <span>Thời gian mong muốn: </span>
                      <span className="font-extrabold text-slate-900">Đến ngay lập tức</span>
                    </div>
                  </div>

                  {/* Primary Button */}
                  <motion.button
                    type="button"
                    onClick={() => handleScreenChange('tracking')}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    className="w-full py-3.5 rounded-2xl bg-linear-to-r from-[#FF5E14] to-[#FF772E] text-white font-black text-sm shadow-md shadow-orange-500/30 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Tìm thợ gần nhất (24 thợ online)</span>
                    <ArrowRight className="w-4 h-4" />
                  </motion.button>
                </motion.div>
              )}

              {/* SCREEN 2: GPS TRACKING */}
              {activeScreen === 'tracking' && (
                <motion.div
                  key="tracking"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                  className="space-y-4"
                >
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-sm font-black text-slate-900">Đang điều phối thợ</span>
                    <span className="text-xs font-bold bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-600 animate-ping" />
                      Đã nhận cuốc
                    </span>
                  </div>

                  {/* Simulated GPS Map */}
                  <div className="relative h-48 w-full bg-slate-100 rounded-2xl overflow-hidden border border-slate-200">
                    <div className="absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] bg-size-[12px_12px]" />
                    <div className="absolute top-1/2 left-0 right-0 h-4 bg-slate-300/80 -translate-y-1/2" />
                    <div className="absolute left-1/3 top-0 bottom-0 w-4 bg-slate-300/80" />
                    <div className="absolute left-2/3 top-0 bottom-0 w-3 bg-slate-300/80" />

                    {/* Dynamic route line connecting technician to customer */}
                    <div className="absolute top-1/2 left-[30%] w-[38%] h-1 bg-linear-to-r from-[#FF5E14] via-amber-400 to-[#FF5E14] rounded-full z-10" />

                    {/* Customer Marker */}
                    <div className="absolute top-[43%] right-[22%] -translate-y-1/2 z-20 flex flex-col items-center">
                      <div className="bg-slate-900 text-white text-[11px] px-2 py-0.5 rounded-md font-extrabold whitespace-nowrap mb-0.5">
                        Bạn ở đây
                      </div>
                      <div className="w-6 h-6 rounded-full bg-blue-600 border-2 border-white shadow-md flex items-center justify-center text-white text-xs">
                        📍
                      </div>
                    </div>

                    {/* Technician Marker with Pulse Radar Rings */}
                    <motion.div
                      animate={{
                        x: [0, 8, 0],
                        y: [0, -3, 0],
                      }}
                      transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                      className="absolute top-[43%] left-[26%] -translate-y-1/2 z-20 flex flex-col items-center"
                    >
                      <div className="bg-[#FF5E14] text-white text-[11px] px-2 py-0.5 rounded-md font-extrabold whitespace-nowrap mb-0.5 shadow-sm">
                        Thợ Tuấn (500m)
                      </div>
                      <div className="relative">
                        <div className="absolute inset-0 rounded-full bg-[#FF5E14] animate-radar -z-10" />
                        <div className="w-8 h-8 rounded-full bg-[#FF5E14] border-2 border-white shadow-lg flex items-center justify-center text-white">
                          <Wrench className="w-4 h-4" />
                        </div>
                      </div>
                    </motion.div>

                    {/* ETA Float */}
                    <div className="absolute bottom-2.5 left-2.5 right-2.5 bg-white/95 backdrop-blur-md px-3.5 py-2 rounded-xl border border-slate-200 flex items-center justify-between z-20 shadow-xs">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-[#FF5E14]" />
                        <span className="text-xs sm:text-sm font-extrabold text-slate-900">
                          Dự kiến đến: 12 phút
                        </span>
                      </div>
                      <span className="text-xs text-slate-600 font-bold">Cách 850m</span>
                    </div>
                  </div>

                  {/* Craftsman Profile Card */}
                  <div className="border border-slate-200 rounded-2xl p-4 bg-white space-y-3 shadow-xs">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-13 h-13 rounded-full bg-slate-200 overflow-hidden ring-2 ring-[#FF5E14]">
                          <img
                            src="https://images.unsplash.com/photo-1540569014015-19a7be504e3a?w=150&auto=format&fit=crop&q=80"
                            alt="Thợ Trần Quốc Tuấn"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-white rounded-full p-0.5">
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h5 className="text-sm sm:text-base font-extrabold text-slate-900 truncate">
                            Trần Quốc Tuấn
                          </h5>
                          <span className="bg-orange-100 text-[#FF5E14] text-[10px] font-black px-2 py-0.5 rounded-sm">
                            Thợ Vàng
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 font-medium mt-0.5">
                          Điện lạnh • 7 năm kinh nghiệm
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-xs">
                          <span className="flex items-center text-amber-500 font-extrabold">
                            <Star className="w-3.5 h-3.5 fill-amber-400 mr-1" /> 4.95
                          </span>
                          <span className="text-slate-300">•</span>
                          <span className="text-slate-600 font-semibold">1.420 đơn thành công</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 pt-1">
                      <motion.button
                        type="button"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        className="py-2.5 px-3 rounded-xl bg-slate-100 text-slate-800 font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 hover:bg-slate-200"
                      >
                        <PhoneCall className="w-4 h-4 text-[#FF5E14]" />
                        <span>Gọi thợ</span>
                      </motion.button>
                      <motion.button
                        type="button"
                        onClick={() => handleScreenChange('review')}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        className="py-2.5 px-3 rounded-xl bg-orange-50 text-[#FF5E14] font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 border border-orange-200 cursor-pointer"
                      >
                        <span>Xem hoàn thành</span>
                        <ChevronRight className="w-4 h-4" />
                      </motion.button>
                    </div>
                  </div>

                  <div className="bg-amber-50/80 border border-amber-200/90 rounded-xl p-2.5 flex items-center gap-2.5 text-xs text-amber-900">
                    <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                    <span className="font-medium">
                      Thợ đã xác thực CCCD gắn chip & kiểm tra tay nghề chuẩn.
                    </span>
                  </div>
                </motion.div>
              )}

              {/* SCREEN 3: COMPLETION & REVIEW */}
              {activeScreen === 'review' && (
                <motion.div
                  key="review"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                  className="space-y-4"
                >
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-sm font-black text-slate-900">Hoàn tất công việc</span>
                    <span className="text-xs text-emerald-700 font-bold bg-emerald-100 px-2.5 py-1 rounded-full">
                      Đã nghiệm thu
                    </span>
                  </div>

                  {/* Work Summary Card */}
                  <div className="bg-linear-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-orange-400 uppercase tracking-wider">
                        Dịch vụ hoàn thành
                      </span>
                      <span className="text-xs text-slate-400 font-mono font-bold">#HG-8821</span>
                    </div>
                    <h4 className="text-sm sm:text-base font-black text-white">
                      Vệ sinh & Nạp gas máy lạnh Inverter
                    </h4>
                    <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                      Máy lạnh chạy êm ái, khử khuẩn nano bạc sạch sẽ, kiểm tra độ lạnh sâu đạt chuẩn.
                    </p>
                    <div className="pt-2.5 border-t border-slate-700 flex items-center justify-between text-xs sm:text-sm">
                      <span className="text-slate-400">Thợ phụ trách:</span>
                      <span className="font-extrabold text-white">Trần Quốc Tuấn</span>
                    </div>
                  </div>

                  {/* Rating Card */}
                  <div className="border border-slate-200 rounded-2xl p-4 bg-white text-center space-y-2">
                    <p className="text-sm font-extrabold text-slate-900">
                      Đánh giá chất lượng phục vụ
                    </p>
                    <div className="flex items-center justify-center gap-1.5 text-amber-400 py-1">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <motion.button
                          key={s}
                          type="button"
                          whileHover={{ scale: 1.25 }}
                          whileTap={{ scale: 0.9 }}
                          className="focus:outline-none"
                        >
                          <Star className="w-6 h-6 fill-amber-400 cursor-pointer" />
                        </motion.button>
                      ))}
                    </div>
                    <p className="text-xs sm:text-sm text-slate-600 italic">
                      Thợ tới đúng 15 phút, thao tác rất chuyên nghiệp và lịch sự!
                    </p>
                  </div>

                  <motion.button
                    type="button"
                    onClick={() => handleScreenChange('booking')}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    className="w-full py-3.5 rounded-xl bg-[#FF5E14] text-white font-extrabold text-sm hover:bg-[#E04800] flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                  >
                    <span>Đặt dịch vụ mới</span>
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* App Bottom Navigation Bar inside the Phone */}
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-white/95 backdrop-blur-md border-t border-slate-100 flex items-center justify-around px-2 z-20">
            <button
              type="button"
              onClick={() => handleScreenChange('booking')}
              className={`flex flex-col items-center gap-1 transition-colors cursor-pointer ${
                activeScreen === 'booking' ? 'text-[#FF5E14]' : 'text-slate-400'
              }`}
            >
              <Wrench className="w-5 h-5" />
              <span className="text-[11px] font-bold">Trang chủ</span>
            </button>
            <button
              type="button"
              onClick={() => handleScreenChange('tracking')}
              className={`flex flex-col items-center gap-1 transition-colors cursor-pointer ${
                activeScreen === 'tracking' ? 'text-[#FF5E14]' : 'text-slate-400'
              }`}
            >
              <Navigation className="w-5 h-5" />
              <span className="text-[11px] font-bold">Định vị</span>
            </button>
            <button
              type="button"
              onClick={() => handleScreenChange('review')}
              className={`flex flex-col items-center gap-1 transition-colors cursor-pointer ${
                activeScreen === 'review' ? 'text-[#FF5E14]' : 'text-slate-400'
              }`}
            >
              <CheckCircle2 className="w-5 h-5" />
              <span className="text-[11px] font-bold">Đánh giá</span>
            </button>
          </div>

          {/* Bottom gesture bar */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-slate-300 rounded-full z-30" />
        </div>
      </motion.div>
    </div>
  );
};
