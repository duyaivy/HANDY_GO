import React from "react";
import {
  Sparkles,
  Users,
  Wrench,
  Clock,
  CheckCircle2,
  HeartHandshake,
  Award,
} from "lucide-react";
import { motion } from "motion/react";
import Image from "next/image";

export const AboutSection: React.FC = () => {
  const stats = [
    { value: "128.000+", label: "Hộ gia đình tin dùng", icon: Users },
    { value: "5.000+", label: "Thợ lành nghề phủ khắp", icon: Wrench },
    { value: "15 Phút", label: "Thời gian kết nối trung bình", icon: Clock },
    { value: "99.4%", label: "Tỷ lệ khách hàng hài lòng", icon: Award },
  ];

  const values = [
    {
      title: "Tốc Độ Tiên Phong",
      desc: "Công nghệ định vị thông minh giúp ghép nối thợ di chuyển gần nhất chỉ sau 60 giây, có mặt xử lý sự cố trong 15 phút.",
    },
    {
      title: "Minh Bạch Tuyệt Đối",
      desc: "Mọi thông tin về lý lịch thợ, lộ trình di chuyển và quy trình làm việc đều hiển thị rõ ràng trên ứng dụng điện thoại.",
    },
    {
      title: "Tận Tâm & Lịch Sự",
      desc: "Thợ Handy Go luôn giữ thái độ niềm nở, mang đồng phục chỉnh tề, bọc giày bảo vệ sàn nhà và thu dọn sạch sẽ sau khi hoàn thành.",
    },
    {
      title: "Chuẩn Hóa Nghề Thợ",
      desc: "Nâng tầm vị thế của người thợ Việt Nam thông qua quy chuẩn sát hạch khắt khe và hệ thống đánh giá sao công bằng.",
    },
  ];

  return (
    <section
      id="about"
      className="py-20 lg:py-28 bg-slate-50 relative overflow-hidden"
    >
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-orange-100/40 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-amber-100/30 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header with smooth entrance */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="text-center max-w-3xl mx-auto mb-16 space-y-3"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-orange-100 text-[#FF5E14] text-xs sm:text-sm font-bold uppercase tracking-wider">
            <Sparkles className="w-4 h-4" />
            <span>Về Chúng Tôi</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight">
            Cầu Nối Công Nghệ Cho Mọi Nhu Cầu Sửa Chữa Gia Đình
          </h2>
          <p className="text-slate-600 text-base sm:text-lg leading-relaxed">
            Handy Go ra đời với sứ mệnh giải quyết triệt để nỗi lo tìm thợ sửa
            chữa: không còn cảnh chờ đợi mòn mỏi, không còn thợ lạ thiếu tin
            cậy. Chúng tôi kết nối bạn với những người thợ giỏi nhất ngay trong
            khu vực chỉ bằng 1 chạm trên điện thoại.
          </p>
        </motion.div>

        {/* Stats Grid with staggered scroll reveal */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-16">
          {stats.map((s, index) => {
            const Icon = s.icon;
            return (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 25 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{
                  duration: 0.5,
                  delay: index * 0.1,
                  ease: "easeOut",
                }}
                whileHover={{ y: -6, transition: { duration: 0.2 } }}
                className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow text-center space-y-2.5"
              >
                <div className="w-13 h-13 rounded-2xl bg-orange-50 text-[#FF5E14] flex items-center justify-center mx-auto mb-3">
                  <Icon className="w-6 h-6" />
                </div>
                <p className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900">
                  {s.value}
                </p>
                <p className="text-sm sm:text-base font-bold text-slate-600">
                  {s.label}
                </p>
              </motion.div>
            );
          })}
        </div>

        {/* Story & Image Row with smooth reveal */}
        <motion.div
          initial={{ opacity: 0, y: 35 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="bg-white rounded-3xl border border-slate-200/90 shadow-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-center"
        >
          <div className="lg:col-span-6 p-8 sm:p-12 space-y-6">
            <div className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold uppercase tracking-wider text-[#FF5E14]">
              <HeartHandshake className="w-4 h-4" />
              <span>Sứ Mệnh Phát Triển</span>
            </div>

            <h3 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 leading-tight">
              Mang Lại Cuộc Sống Thảnh Thơi Cho Hàng Triệu Hộ Gia Đình
            </h3>

            <p className="text-slate-600 text-base sm:text-lg leading-relaxed">
              Bắt nguồn từ sự thấu hiểu sâu sắc trước những phiền toái khi đường
              ống nước bị vỡ lúc nửa đêm, máy lạnh ngừng mát giữa trưa hè oi ả,
              hay chập điện không rõ nguyên nhân — Handy Go ứng dụng công nghệ
              di động tiên tiến để đưa người thợ lành nghề đến hỗ trợ kịp thời
              nhất.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-2">
              {values.map((v) => (
                <div key={v.title} className="space-y-1.5">
                  <h4 className="text-sm sm:text-base font-black text-slate-900 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#FF5E14] shrink-0" />
                    <span>{v.title}</span>
                  </h4>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-normal">
                    {v.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-6 relative h-80 sm:h-96 lg:h-full min-h-105 bg-slate-100 overflow-hidden group">
            <Image
              src="https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=800&auto=format&fit=crop&q=80"
              alt="Đội ngũ Handy Go"
              width={800}
              height={600}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-linear-to-t from-slate-900/60 via-transparent to-transparent" />
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="absolute bottom-6 left-6 right-6 p-5 rounded-2xl bg-white/95 backdrop-blur-md border border-white/40 shadow-lg"
            >
              <p className="text-sm sm:text-base font-black text-slate-900">
                Cam kết chất lượng dịch vụ Handy Go
              </p>
              <p className="text-xs sm:text-sm text-slate-600 mt-1 font-medium leading-relaxed">
                Đồng hành và chăm sóc không gian sống của mỗi gia đình Việt bằng
                cả trái tim và tay nghề vững vàng.
              </p>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
