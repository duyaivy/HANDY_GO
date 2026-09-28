import React from "react";
import {
  Wrench,
  UserCheck,
  Award,
  Briefcase,
  Star,
  CheckCircle2,
  Users,
} from "lucide-react";
import { motion } from "motion/react";
import Image from "next/image";

export const CraftsmanSection: React.FC = () => {
  const standards = [
    {
      step: "01",
      icon: UserCheck,
      title: "Xác Minh Danh Tính & CCCD 100%",
      desc: "Mọi thợ trên Handy Go đều được xác thực danh tính qua căn cước công dân gắn chip và kiểm tra lý lịch trong sạch trước khi được nhận việc.",
    },
    {
      step: "02",
      icon: Award,
      title: "Sát Hạch Tay Nghề Nghiêm Ngặt",
      desc: "Kiểm tra kỹ năng thực hành trực tiếp tại trung tâm đào tạo Handy Go bởi các chuyên gia kỹ thuật có trên 10 năm kinh nghiệm.",
    },
    {
      step: "03",
      icon: Briefcase,
      title: "Đồng Phục & Đồ Nghề Chuyên Dụng",
      desc: "Thợ luôn mang đồng phục cam Handy Go, đeo thẻ căn cước số, mang bọc giày cách ẩm bảo vệ sàn nhà và trang thiết bị an toàn đạt chuẩn.",
    },
    {
      step: "04",
      icon: Star,
      title: "Văn Hóa Giao Tiếp Lịch Sự",
      desc: "Thợ được tập huấn văn hóa ứng xử văn minh, luôn niềm nở, trung thực, tôn trọng không gian riêng tư của mỗi gia đình.",
    },
  ];

  const craftsmanRoster = [
    {
      name: "Trần Quốc Tuấn",
      trade: "Chuyên viên Điện Lạnh & Điều Hòa",
      exp: "7 năm kinh nghiệm",
      jobs: "1.420 đơn",
      rating: 4.95,
      avatar:
        "https://images.unsplash.com/photo-1540569014015-19a7be504e3a?w=150&auto=format&fit=crop&q=80",
    },
    {
      name: "Nguyễn Văn Hùng",
      trade: "Kỹ sư Hệ Thống Điện Dân Dụng",
      exp: "9 năm kinh nghiệm",
      jobs: "1.890 đơn",
      rating: 4.98,
      avatar:
        "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
    },
    {
      name: "Lê Hoàng Long",
      trade: "Chuyên gia Cấp Thoát Nước & Bơm",
      exp: "6 năm kinh nghiệm",
      jobs: "1.150 đơn",
      rating: 4.92,
      avatar:
        "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80",
    },
  ];

  return (
    <section
      id="craftsmen"
      className="py-20 lg:py-28 bg-slate-900 text-white relative overflow-hidden"
    >
      {/* Glow ambient background with motion */}
      <motion.div
        animate={{
          scale: [1, 1.15, 1],
          opacity: [0.15, 0.25, 0.15],
        }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-0 right-1/4 w-96 h-96 bg-orange-600/20 rounded-full blur-3xl pointer-events-none"
      />
      <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header with smooth entrance */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="text-center max-w-3xl mx-auto mb-16 space-y-3"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-orange-500/20 border border-orange-500/40 text-orange-400 text-xs sm:text-sm font-bold uppercase tracking-wider">
            <Wrench className="w-4 h-4" />
            <span>Đội Ngũ Thợ Lành Nghề</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight">
            Những Bàn Tay Vàng Tận Tâm Phục Vụ
          </h2>
          <p className="text-slate-300 text-base sm:text-lg leading-relaxed">
            Handy Go tự hào quy tụ mạng lưới hơn 5.000 thợ kỹ thuật lành nghề
            trên toàn quốc — những người luôn lấy uy tín, tay nghề vững vàng và
            sự hài lòng của khách hàng làm kim chỉ nam.
          </p>
        </motion.div>

        {/* 4 Standards Grid with Staggered Entrance */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {standards.map((s, index) => {
            const Icon = s.icon;
            return (
              <motion.div
                key={s.step}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{
                  duration: 0.5,
                  delay: index * 0.1,
                  ease: "easeOut",
                }}
                whileHover={{ y: -6, borderColor: "rgba(255, 94, 20, 0.7)" }}
                className="bg-slate-800/80 border border-slate-700/80 rounded-3xl p-6 sm:p-7 transition-all space-y-4 relative group shadow-sm cursor-default"
              >
                <div className="flex items-center justify-between">
                  <div className="w-13 h-13 rounded-2xl bg-[#FF5E14] text-white flex items-center justify-center shadow-lg shadow-orange-500/20 group-hover:scale-110 transition-transform duration-300">
                    <Icon className="w-6 h-6" />
                  </div>
                  <span className="text-3xl font-black text-slate-600 group-hover:text-orange-400 transition-colors">
                    {s.step}
                  </span>
                </div>

                <h3 className="text-lg sm:text-xl font-black text-white leading-snug">
                  {s.title}
                </h3>

                <p className="text-sm sm:text-base text-slate-300 leading-relaxed font-normal">
                  {s.desc}
                </p>
              </motion.div>
            );
          })}
        </div>

        {/* Featured Craftsmen Showcase Cards */}
        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="flex items-center justify-between flex-wrap gap-2"
          >
            <h3 className="text-xl sm:text-2xl font-black text-white">
              Gương Mặt Thợ Xuất Sắc Tiêu Biểu
            </h3>
            <span className="text-sm text-orange-400 font-bold flex items-center gap-1.5">
              <Users className="w-4 h-4" /> 5.000+ Thợ trực tuyến
            </span>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {craftsmanRoster.map((c, i) => (
              <motion.div
                key={c.name}
                initial={{ opacity: 0, y: 25 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.5, delay: i * 0.12 }}
                whileHover={{ y: -5, scale: 1.01 }}
                className="bg-slate-800/90 border border-slate-700 rounded-3xl p-6 flex items-center gap-4 hover:border-orange-500/60 transition-colors shadow-sm cursor-default"
              >
                <div className="relative shrink-0">
                  <Image
                    src={c.avatar}
                    alt={c.name}
                    width={500}
                    height={300}
                    className="w-16 h-16 rounded-full object-cover ring-2 ring-[#FF5E14]"
                  />
                  <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-white rounded-full p-0.5 shadow-sm">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                </div>

                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-base sm:text-lg font-black text-white truncate">
                      {c.name}
                    </h4>
                    <span className="flex items-center text-amber-400 text-sm font-black">
                      <Star className="w-4 h-4 fill-amber-400 mr-1" />{" "}
                      {c.rating}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-orange-400 font-semibold truncate">
                    {c.trade}
                  </p>
                  <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-300 pt-0.5 font-medium">
                    <span>{c.exp}</span>
                    <span>•</span>
                    <span>{c.jobs}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
