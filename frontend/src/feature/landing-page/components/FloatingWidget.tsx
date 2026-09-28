import React from 'react';
import { PhoneCall, Smartphone } from 'lucide-react';
import { motion } from 'motion/react';

interface FloatingWidgetProps {
  onOpenDownload: () => void;
}

export const FloatingWidget: React.FC<FloatingWidgetProps> = ({ onOpenDownload }) => {
  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3 pointer-events-none">
      {/* 24/7 Hotline Quick Call */}
      <motion.a
        href="tel:19008899"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-slate-900/95 backdrop-blur-md text-white hover:bg-slate-800 shadow-xl border border-slate-700 transition-all text-xs font-bold group"
        title="Gọi tổng đài cứu hộ khẩn cấp 24/7"
      >
        <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-white shrink-0 group-hover:rotate-12 transition-transform">
          <PhoneCall className="w-3.5 h-3.5" />
        </div>
        <span className="hidden sm:inline">Cứu Hộ 24/7: </span>
        <span className="text-emerald-400 font-black">1900 8899</span>
      </motion.a>

      {/* Main Download App Pulsing Button */}
      <motion.button
        type="button"
        onClick={onOpenDownload}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25, delay: 0.5 }}
        whileHover={{ scale: 1.07 }}
        whileTap={{ scale: 0.93 }}
        className="pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-full bg-linear-to-r from-[#FF5E14] via-[#FF6F22] to-[#FFA048] text-white shadow-2xl orange-glow hover:shadow-orange-500/60 transition-all font-extrabold text-xs"
      >
        <div className="relative">
          <Smartphone className="w-5 h-5" />
          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-yellow-300 animate-ping" />
        </div>
        <span>Tải App Handy Go</span>
      </motion.button>
    </div>
  );
};
