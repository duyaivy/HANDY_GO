import React from 'react';
import {
  Smartphone,
  MapPin,
  Clock,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Wind,
  Zap,
  Droplets,
  Key,
  Wrench,
  Paintbrush,
  Sparkles,
  PhoneCall,
  Search,
} from 'lucide-react';
import { motion } from 'motion/react';

interface CustomerSectionProps {
  onOpenDownload: () => void;
}

export const CustomerSection: React.FC<CustomerSectionProps> = ({
  onOpenDownload,
}) => {
  const steps = [
    {
      num: '01',
      title: 'Mở App & Chọn Dịch Vụ',
      desc: 'Chọn vấn đề cần hỗ trợ: điện nước, điện lạnh, khóa cửa, sơn sửa... nhập địa chỉ căn hộ của bạn.',
      icon: Search,
    },
    {
      num: '02',
      title: 'Hệ Thống Ghép Thợ Gần Nhất',
      desc: 'Handy Go quét bán kính gần bạn nhất, kết nối thợ đã xác thực tay nghề trong vòng 60 giây.',
      icon: MapPin,
    },
    {
      num: '03',
      title: 'Thợ Đến Tận Nơi Trong 15 Phút',
      desc: 'Theo dõi trực tiếp vị trí thợ di chuyển trên bản đồ GPS, biết trước tên, hình ảnh và biển số xe.',
      icon: Clock,
    },
    {
      num: '04',
      title: 'Nghiệm Thu & Thanh Toán',
      desc: 'Khách hàng kiểm tra thực tế, hài lòng mới xác nhận hoàn tất dịch vụ và đánh giá chất lượng thợ.',
      icon: CheckCircle2,
    },
  ];

  const popularServices = [
    {
      name: 'Sửa chữa & Vệ sinh Điện lạnh',
      desc: 'Bảo dưỡng điều hòa, nạp gas, xử lý máy lạnh chảy nước, tủ lạnh không mát.',
      icon: Wind,
      badge: 'Đặt nhiều nhất',
    },
    {
      name: 'Sự cố Điện gia dụng & Hệ thống',
      desc: 'Khắc phục chập cháy CB, lắp đèn trang trí, đi lại dây âm tường an toàn.',
      icon: Zap,
      badge: 'Khẩn cấp 24/7',
    },
    {
      name: 'Ống nước & Thiết bị Vệ sinh',
      desc: 'Xử lý rò rỉ đường ống, thông tắc bồn cầu, thay vòi sen, máy bơm nước.',
      icon: Droplets,
      badge: 'Phản hồi 15p',
    },
    {
      name: 'Mở & Thay khóa khẩn cấp',
      desc: 'Mở khóa cửa nhà, khóa từ thông minh vân tay, làm lại chìa an toàn tuyệt đối.',
      icon: Key,
      badge: 'Cứu hộ khẩn',
    },
    {
      name: 'Sửa chữa Đồ gỗ & Nội thất',
      desc: 'Sửa bản lề tủ bếp, lắp ráp bàn ghế, chỉnh cửa xệ, phụ kiện thông minh.',
      icon: Wrench,
      badge: 'Thợ lành nghề',
    },
    {
      name: 'Sơn dặm & Chống thấm nhà',
      desc: 'Sơn mới phòng khách, dặm tường bong tróc, xử lý ố vàng trần thạch cao.',
      icon: Paintbrush,
      badge: 'Thẩm mỹ cao',
    },
  ];

  return (
    <section id="customers" className="py-20 lg:py-28 bg-white relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="text-center max-w-3xl mx-auto mb-16 space-y-3"
        >
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-orange-50 border border-orange-200 text-[#FF5E14] text-xs sm:text-sm font-bold uppercase tracking-wider">
            <Smartphone className="w-4 h-4" />
            <span>Dành Cho Khách Hàng</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight">
            Đặt Dịch Vụ Nhanh Chóng Trên Điện Thoại
          </h2>
          <p className="text-slate-600 text-base sm:text-lg leading-relaxed">
            Ứng dụng Handy Go trên điện thoại giúp bạn tìm kiếm người thợ phù hợp nhất chỉ trong vài giây, tiết kiệm thời gian và đảm bảo an tâm tuyệt đối.
          </p>
        </motion.div>

        {/* 4 Steps Showcase with Staggered Entrance */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-20">
          {steps.map((st, index) => {
            const Icon = st.icon;
            return (
              <motion.div
                key={st.num}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.5, delay: index * 0.1, ease: 'easeOut' }}
                whileHover={{ y: -6, transition: { duration: 0.25 } }}
                className="bg-slate-50 border border-slate-200/80 rounded-3xl p-6 sm:p-7 hover:border-orange-300 hover:bg-orange-50/25 transition-all flex flex-col justify-between group shadow-2xs cursor-default"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-13 h-13 rounded-2xl bg-white border border-slate-200 text-[#FF5E14] flex items-center justify-center shadow-xs group-hover:scale-110 transition-transform duration-300">
                      <Icon className="w-6 h-6" />
                    </div>
                    <span className="text-3xl sm:text-4xl font-black text-slate-300 group-hover:text-orange-400 transition-colors">
                      {st.num}
                    </span>
                  </div>

                  <h3 className="text-lg sm:text-xl font-black text-slate-900 leading-snug">
                    {st.title}
                  </h3>

                  <p className="text-sm sm:text-base text-slate-600 leading-relaxed font-normal">
                    {st.desc}
                  </p>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-200/80 flex items-center gap-1.5 text-xs sm:text-sm font-extrabold text-[#FF5E14]">
                  <span>Bước {st.num}</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1.5 transition-transform duration-300" />
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Dual Column: Popular Services + Mobile Phone Showcase */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Services Grid (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            <div className="space-y-2">
              <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#FF5E14]">
                Dịch vụ được đặt nhiều nhất
              </span>
              <h3 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900">
                Mọi Nhu Cầu Sửa Chữa Đều Có Thợ Chuyên Môn
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
              {popularServices.map((srv, idx) => {
                const Icon = srv.icon;
                return (
                  <motion.div
                    key={srv.name}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-40px' }}
                    transition={{ duration: 0.4, delay: idx * 0.08 }}
                    whileHover={{ y: -4, scale: 1.01 }}
                    className="p-5 sm:p-6 rounded-3xl bg-slate-50 border border-slate-200/80 hover:border-orange-300 hover:bg-orange-50/25 transition-all space-y-3 shadow-2xs cursor-default"
                  >
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-[#FF5E14] shadow-xs">
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-white text-slate-700 border border-slate-200 shadow-2xs">
                        {srv.badge}
                      </span>
                    </div>

                    <h4 className="text-base sm:text-lg font-black text-slate-900 leading-snug">
                      {srv.name}
                    </h4>

                    <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-normal">
                      {srv.desc}
                    </p>
                  </motion.div>
                );
              })}
            </div>

            <div className="pt-2">
              <motion.button
                type="button"
                onClick={onOpenDownload}
                whileHover={{ scale: 1.03, y: -2 }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-linear-to-r from-[#FF5E14] to-[#FF772E] text-white font-black text-sm shadow-md orange-glow transition-all flex items-center justify-center gap-2.5"
              >
                <Smartphone className="w-5 h-5" />
                <span>Mở App Đặt Thợ Ngay</span>
                <ArrowRight className="w-5 h-5" />
              </motion.button>
            </div>
          </div>

          {/* Visual Smartphone Preview with Customer UI (5 cols) */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 30 }}
            whileInView={{ opacity: 1, scale: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-5 flex justify-center"
          >
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
              className="relative w-[320px] sm:w-87.5 bg-slate-950 p-3 rounded-[50px] ring-1 ring-slate-800 shadow-2xl phone-shadow"
            >
              <div className="w-full bg-white rounded-[42px] overflow-hidden text-left p-4.5 space-y-4">
                {/* Dynamic island */}
                <div className="w-24 h-4.5 bg-black rounded-full mx-auto" />

                {/* App Topbar */}
                <div className="flex items-center justify-between pt-1">
                  <div>
                    <span className="text-xs text-slate-500 font-semibold">Xin chào bạn,</span>
                    <p className="text-sm font-extrabold text-slate-900">Cần thợ hỗ trợ hôm nay?</p>
                  </div>
                  <img
                    src="/handygo-app-icon.svg"
                    alt="HandyGo"
                    className="w-9 h-9 rounded-xl object-contain shadow-xs"
                  />
                </div>

                {/* Quick Map Widget in App */}
                <div className="h-40 bg-slate-100 rounded-2xl relative overflow-hidden border border-slate-200">
                  <div className="absolute inset-0 bg-[radial-gradient(#94a3b8_1px,transparent_1px)] [background-size:10px_10px]" />
                  <div className="absolute top-1/2 left-0 right-0 h-3.5 bg-slate-300 -translate-y-1/2" />
                  <div className="absolute left-1/2 top-0 bottom-0 w-3.5 bg-slate-300 -translate-x-1/2" />

                  <div className="absolute top-[38%] right-[18%] text-xs font-bold flex items-center gap-1">
                    <span className="text-sm">🏠</span>
                    <span className="text-[10px] bg-slate-900 text-white px-1.5 py-0.5 rounded font-extrabold">
                      Nhà bạn
                    </span>
                  </div>

                  {/* Motorbike Technician Pin with continuous gentle bounce & radar ripple */}
                  <motion.div
                    animate={{
                      x: [0, 6, 0],
                      y: [0, -3, 0],
                    }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute top-[46%] left-[22%] text-xs flex items-center gap-1.5"
                  >
                    <div className="relative">
                      <div className="absolute inset-0 rounded-full bg-[#FF5E14] animate-radar -z-10" />
                      <span className="w-7 h-7 rounded-full bg-[#FF5E14] text-white flex items-center justify-center text-xs font-black shadow-md">
                        🛵
                      </span>
                    </div>
                    <span className="text-[10px] bg-[#FF5E14] text-white px-2 py-0.5 rounded font-extrabold shadow-xs">
                      Thợ Tuấn (12 phút)
                    </span>
                  </motion.div>
                </div>

                {/* Active Booking Card */}
                <div className="p-3.5 bg-orange-50/80 border border-orange-200/90 rounded-2xl space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between text-xs sm:text-sm font-extrabold text-slate-900">
                    <span>Đang điều phối thợ</span>
                    <span className="text-xs text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full font-extrabold">
                      Đã nhận đơn
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-medium">
                    Thợ Trần Quốc Tuấn đang trên đường tới căn hộ của bạn.
                  </p>
                  <div className="flex items-center justify-between pt-1.5 border-t border-orange-200/70 text-xs font-medium text-slate-600">
                    <span>Thời gian dự kiến:</span>
                    <span className="font-black text-slate-900 text-sm">~12 phút</span>
                  </div>
                </div>

                <div className="w-full py-3 rounded-xl bg-slate-900 text-white text-center text-xs sm:text-sm font-black shadow-xs">
                  Theo Dõi Lộ Trình Thợ
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};
