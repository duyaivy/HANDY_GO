import React from 'react';
import { Star, CheckCircle2, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';

export const Testimonials: React.FC = () => {
  const reviews = [
    {
      name: 'Chị Mai Lan',
      role: 'Cư dân Masteri Thảo Điền (TP. Thủ Đức)',
      avatar:
        'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&auto=format&fit=crop&q=80',
      service: 'Vệ sinh 3 máy lạnh Inverter',
      rating: 5,
      date: 'Hôm qua',
      comment:
        'Thực sự bất ngờ vì thợ đến đúng 15 phút sau khi đặt trên app. Thợ mặc đồng phục cam Handy Go lịch sự, mang bọc giày chuyên dụng không làm ướt sàn gỗ. Máy lạnh rửa xong mát lạnh, chạy êm ru!',
    },
    {
      name: 'Anh Trần Minh Khoa',
      role: 'Chung cư Goldmark City (Bắc Từ Liêm, Hà Nội)',
      avatar:
        'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=120&auto=format&fit=crop&q=80',
      service: 'Xử lý chập điện & nhảy CB lúc 21h',
      rating: 5,
      date: '3 ngày trước',
      comment:
        'Buổi tối nhà mất điện toàn bộ rất hoang mang. Mở app Handy Go bấm gọi thợ cấp tốc, thợ Tuấn đến sau 12 phút với máy đo điện dò ra ngay đoạn dây âm tường bị chuột cắn. Làm việc rất có tâm và chuyên nghiệp.',
    },
    {
      name: 'Chị Hoàng Yến Nhi',
      role: 'Nhà phố KDC Him Lam (Quận 7, TP. HCM)',
      avatar:
        'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=120&auto=format&fit=crop&q=80',
      service: 'Thông cống nghẹt & thay vòi sen',
      rating: 5,
      date: '1 tuần trước',
      comment:
        'Đặt thợ trên app Handy Go cực kỳ nhanh và tiện lợi. Thợ đến xem xét cẩn thận, giải thích rõ nguyên nhân rồi mới sửa. Xử lý triệt để trong 30 phút, phòng tắm sạch bong.',
    },
  ];

  return (
    <section id="reviews" className="py-20 lg:py-28 bg-white relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="text-center max-w-3xl mx-auto mb-16 space-y-3"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-orange-50 border border-orange-200 text-[#FF5E14] text-xs sm:text-sm font-bold uppercase tracking-wider">
            <Sparkles className="w-4 h-4" />
            <span>Đánh Giá Khách Hàng</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight">
            128.000+ Gia Đình Đã Trao Gửi Niềm Tin
          </h2>
          <p className="text-slate-600 text-base sm:text-lg leading-relaxed">
            Đánh giá thực tế từ các hộ gia đình chung cư và nhà phố đã trực tiếp trải nghiệm dịch vụ gọi thợ qua ứng dụng Handy Go.
          </p>
        </motion.div>

        {/* Reviews Cards with Staggered Entrance & Lift on Hover */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {reviews.map((r, i) => (
            <motion.div
              key={r.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.5, delay: i * 0.12, ease: 'easeOut' }}
              whileHover={{ y: -8, transition: { duration: 0.25 } }}
              className="bg-slate-50 border border-slate-200/90 rounded-3xl p-6 sm:p-8 flex flex-col justify-between hover:border-orange-300 hover:bg-orange-50/25 hover:shadow-xl transition-all duration-300 relative group shadow-2xs cursor-default"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-1 text-amber-400">
                    {[...Array(r.rating)].map((_, idx) => (
                      <Star key={idx} className="w-5 h-5 fill-amber-400" />
                    ))}
                  </div>
                  <span className="text-xs font-semibold text-slate-400">{r.date}</span>
                </div>

                <p className="text-sm sm:text-base text-slate-700 leading-relaxed italic mb-6">
                  {r.comment}
                </p>
              </div>

              {/* Author & Service info */}
              <div className="pt-4.5 border-t border-slate-200/80 flex items-center gap-3.5">
                <img
                  src={r.avatar}
                  alt={r.name}
                  className="w-13 h-13 rounded-full object-cover ring-2 ring-orange-200 shrink-0 group-hover:scale-105 transition-transform"
                />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-base font-black text-slate-900 truncate">
                      {r.name}
                    </h4>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  </div>
                  <p className="text-xs sm:text-sm text-slate-500 truncate">{r.role}</p>
                  <span className="inline-block text-xs font-bold text-[#FF5E14]">
                    Đã dùng: {r.service}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Trust Badges */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mt-16 pt-10 border-t border-slate-100 grid grid-cols-2 md:grid-cols-4 gap-6 text-center"
        >
          <div className="space-y-1">
            <p className="text-3xl sm:text-4xl font-black text-slate-900">128.000+</p>
            <p className="text-sm font-bold text-slate-600">Đơn đặt thành công</p>
          </div>
          <div className="space-y-1">
            <p className="text-3xl sm:text-4xl font-black text-[#FF5E14]">4.95 / 5</p>
            <p className="text-sm font-bold text-slate-600">Điểm đánh giá trung bình</p>
          </div>
          <div className="space-y-1">
            <p className="text-3xl sm:text-4xl font-black text-slate-900">15 Phút</p>
            <p className="text-sm font-bold text-slate-600">Thời gian thợ tới nhà</p>
          </div>
          <div className="space-y-1">
            <p className="text-3xl sm:text-4xl font-black text-emerald-600">100%</p>
            <p className="text-sm font-bold text-slate-600">Thợ xác thực danh tính</p>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
