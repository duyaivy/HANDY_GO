import React, { useState } from 'react';
import {
  X,
  Smartphone,
  User,
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  Wrench,
  LogIn,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';


interface AuthModalProps {
  isOpen: boolean;
  initialMode?: 'login' | 'register';
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [role, setRole] = useState<'customer' | 'technician'>('customer');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpSent) {
      if (phoneNumber.trim().length >= 9) {
        setOtpSent(true);
      }
    } else {
      setSuccessMsg('Đăng nhập thành công! Chào mừng bạn đến với Handy Go.');
      setTimeout(() => {
        setSuccessMsg('');
        setOtpSent(false);
        setPhoneNumber('');
        setOtp('');
        onClose();
      }, 2000);
    }
  };

  const handleResetAndClose = () => {
    setOtpSent(false);
    setPhoneNumber('');
    setOtp('');
    setSuccessMsg('');
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop with smooth fade */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleResetAndClose}
            className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm"
          />

          {/* Modal Container with spring scale & slide */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 15 }}
            transition={{ type: 'spring', stiffness: 450, damping: 32 }}
            className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden z-10"
          >
            {/* Modal Header */}
            <div className="bg-linear-to-r from-[#FF5E14] via-[#FF6F22] to-[#FFA048] p-6 sm:p-7 text-white relative">
              <motion.button
                type="button"
                onClick={handleResetAndClose}
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                transition={{ duration: 0.2 }}
                className="absolute top-5 right-5 p-2 rounded-full bg-black/15 hover:bg-black/30 text-white transition-colors cursor-pointer"
                aria-label="Đóng"
              >
                <X className="w-5 h-5" />
              </motion.button>

              <div className="flex items-center gap-2 mb-2">
                <span className="bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                  {role === 'customer' ? 'Dành cho Khách hàng' : 'Dành cho Thợ'}
                </span>
              </div>

              <div className="flex items-center gap-2.5">
                <LogIn className="w-7 h-7 text-white" />
                <h3 className="text-2xl sm:text-3xl font-black tracking-tight">
                  Đăng Nhập
                </h3>
              </div>
              <p className="text-orange-100 text-xs sm:text-sm mt-1.5">
                Đăng nhập nhanh bằng số điện thoại để quản lý dịch vụ và đặt thợ
              </p>
            </div>

            {/* Role Toggle: Khách hàng vs Thợ */}
            <div className="p-6 pb-0">
              <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-100 rounded-2xl">
                <button
                  type="button"
                  onClick={() => {
                    setRole('customer');
                    setOtpSent(false);
                  }}
                  className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    role === 'customer'
                      ? 'bg-white text-[#FF5E14] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <User className="w-4 h-4" />
                  <span>Khách hàng</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRole('technician');
                    setOtpSent(false);
                  }}
                  className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    role === 'technician'
                      ? 'bg-white text-[#FF5E14] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Wrench className="w-4 h-4" />
                  <span>Thợ Handy Go</span>
                </button>
              </div>
            </div>

            {/* Content Form */}
            <div className="p-6 sm:p-7 space-y-4">
              {successMsg ? (
                <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-2xl text-center space-y-2">
                  <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
                  <p className="text-base font-bold text-emerald-900">{successMsg}</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {!otpSent ? (
                    <div>
                      <label className="block text-xs sm:text-sm font-bold text-slate-800 mb-1.5">
                        Số điện thoại di động
                      </label>
                      <div className="relative">
                        <Smartphone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="tel"
                          required
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          placeholder="0912 345 678"
                          className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF5E14]"
                        />
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1.5">
                        Hệ thống sẽ gửi mã OTP để xác nhận và đăng nhập tự động
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="p-3.5 bg-orange-50 border border-orange-200 rounded-xl text-xs sm:text-sm text-orange-900 leading-relaxed font-medium">
                        Mã xác thực OTP đã được gửi đến số <strong>{phoneNumber}</strong> (Thử nghiệm: nhập 6 số bất kỳ)
                      </div>
                      <div>
                        <label className="block text-xs sm:text-sm font-bold text-slate-800 mb-1.5">
                          Nhập mã OTP 6 số
                        </label>
                        <input
                          type="text"
                          required
                          maxLength={6}
                          value={otp}
                          onChange={(e) => setOtp(e.target.value)}
                          placeholder="••••••"
                          className="w-full tracking-widest text-center text-xl font-mono font-bold py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#FF5E14]"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setOtpSent(false)}
                        className="text-xs text-[#FF5E14] font-bold hover:underline cursor-pointer"
                      >
                        Đổi số điện thoại khác
                      </button>
                    </div>
                  )}

                  <motion.button
                    type="submit"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#FF5E14] to-[#FF772E] text-white font-black text-sm sm:text-base shadow-md orange-glow flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>{otpSent ? 'Xác Nhận & Đăng Nhập' : 'Tiếp Tục Bằng Số Điện Thoại'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </motion.button>
                </form>
              )}

              <div className="pt-2 border-t border-slate-100 flex items-center justify-center gap-2 text-xs text-slate-500 font-medium">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Thông tin được bảo mật chuẩn mã hóa an toàn Handy Go</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
