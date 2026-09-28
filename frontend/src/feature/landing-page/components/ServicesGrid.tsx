import React, { useState } from 'react';
import {
  Zap,
  Wind,
  Droplets,
  Key,
  Hammer,
  Paintbrush,
  Clock,

  CheckCircle2,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

interface ServicesGridProps {
  onOpenDownload: () => void;
}

const servicesData = [
  {
    id: 'dien',
    name: 'Sửa Điện Dân Dụng',
    icon: Zap,
    tag: 'Cứu hộ khẩn cấp 24/7',
    tagColor: 'bg-amber-100 text-amber-800',
    price: 'Từ 80.000đ',
    image:
      'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=800&auto=format&fit=crop&q=80',
    description:
      'Khắc phục triệt để các sự cố chập cháy điện, nhảy aptomat, mất điện cục bộ và lắp đặt hệ thống đèn chiếu sáng.',
    highlights: [
      'Xử lý chập điện ngầm, rò điện nguy hiểm',
      'Thay mới Aptomat, cầu dao tự động chống giật',
      'Lắp đặt đèn ray, đèn chùm trang trí phòng khách',
      'Đi lại đường dây điện an toàn tiêu chuẩn',
    ],
  },
  {
    id: 'dien-lanh',
    name: 'Điện Lạnh & Máy Giặt',
    icon: Wind,
    tag: 'Khử khuẩn Nano Bạc',
    tagColor: 'bg-blue-100 text-blue-800',
    price: 'Từ 150.000đ',
    image:
      'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=800&auto=format&fit=crop&q=80',
    description:
      'Vệ sinh máy lạnh chuyên sâu bằng bạt che chống bẩn, nạp gas chuẩn hãng và sửa chữa máy giặt không vắt, kêu to.',
    highlights: [
      'Vệ sinh máy lạnh sạch 100% bụi bẩn và nấm mốc',
      'Bơm nạp gas R32, R410A bảo hành không rò rỉ',
      'Khắc phục máy lạnh chảy nước, đông đá dàn lạnh',
      'Sửa bo mạch điều khiển máy giặt, tủ lạnh',
    ],
  },
  {
    id: 'nuoc',
    name: 'Cấp Thoát Nước',
    icon: Droplets,
    tag: 'Xử lý triệt để 100%',
    tagColor: 'bg-cyan-100 text-cyan-800',
    price: 'Từ 80.000đ',
    image:
      'https://images.unsplash.com/photo-1585704032915-c3400ca199e7?w=800&auto=format&fit=crop&q=80',
    description:
      'Giải quyết nhanh các vấn đề rò rỉ ống nước, nghẹt lavabo, lắp bồn cầu, thay mới vòi sen và xử lý máy bơm tăng áp.',
    highlights: [
      'Dò tìm rò rỉ ống nước ngầm bằng máy chuyên dụng',
      'Thông nghẹt bồn rửa chén, đường cống thoát sàn',
      'Lắp đặt, thay thế vòi nước gãy ren âm tường',
      'Sửa chữa máy bơm nước không lên, kêu lớn',
    ],
  },
  {
    id: 'khoa',
    name: 'Khóa & Cửa Cuốn',
    icon: Key,
    tag: 'Có mặt sau 15 phút',
    tagColor: 'bg-emerald-100 text-emerald-800',
    price: 'Từ 120.000đ',
    image:
      'https://images.unsplash.com/photo-1558002038-1055907df827?w=800&auto=format&fit=crop&q=80',
    description:
      'Mở khóa khẩn cấp tận nơi 24/7 khi quên chìa, lắp đặt khóa cửa thông minh vân tay và sửa chữa motor cửa cuốn.',
    highlights: [
      'Mở khóa cửa nhà, cửa phòng ngủ không hư ổ khóa',
      'Lắp khóa cửa điện tử vân tay, thẻ từ các dòng',
      'Sửa chữa cửa cuốn bị kẹt nan, không nhận remote',
      'Thay ruột khóa tay gạt cao cấp chống trộm',
    ],
  },
  {
    id: 'go',
    name: 'Đồ Gỗ & Nội Thất',
    icon: Hammer,
    tag: 'Thợ mộc lành nghề',
    tagColor: 'bg-amber-100 text-amber-900',
    price: 'Từ 90.000đ',
    image:
      'https://images.unsplash.com/photo-1538688525198-9b88f6f53126?w=800&auto=format&fit=crop&q=80',
    description:
      'Khắc phục cửa gỗ xệ, tủ bếp bung bản lề, tháo lắp di dời giường tủ phòng khách và sơn PU làm mới đồ gỗ.',
    highlights: [
      'Sửa cánh cửa tủ bếp xệ, thay bản lề giảm chấn',
      'Thay ray trượt ngăn kéo tủ quần áo êm ái',
      'Tháo lắp di dời giường ngủ, bàn làm việc, tủ gỗ',
      'Gia cố kết cấu bàn ghế gỗ lung lay chắc chắn',
    ],
  },
  {
    id: 'cai-tao',
    name: 'Sơn & Sửa Nhà Cửa',
    icon: Paintbrush,
    tag: 'Che chắn cẩn thận',
    tagColor: 'bg-rose-100 text-rose-800',
    price: 'Từ 150.000đ',
    image:
      'https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=800&auto=format&fit=crop&q=80',
    description:
      'Dặm vá sơn tường bong tróc, đóng vách ngăn thạch cao, chống thấm nhà vệ sinh ban công và khoan treo đồ thẩm mỹ.',
    highlights: [
      'Sơn dặm vá tường nhà nứt nẻ, ẩm mốc bong tróc',
      'Đóng trần thạch cao giật cấp, vách ngăn phòng',
      'Xử lý chống thấm cổ ống thoát sàn nhà vệ sinh',
      'Khoan treo tranh ảnh, giá kệ tivi chuẩn laser',
    ],
  },
];

export const ServicesGrid: React.FC<ServicesGridProps> = ({ onOpenDownload }) => {
  return (
    <section id="services" className="py-20 lg:py-28 bg-white relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-orange-50 border border-orange-200 text-[#FF5E14] text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Đầy Đủ Mọi Nhu Cầu Gia Đình</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight">
            Danh Mục Dịch Vụ Sửa Chữa Chuyên Nghiệp
          </h2>
          <p className="text-slate-600 text-base sm:text-lg">
            Đội ngũ thợ Handy Go được đào tạo chuyên sâu theo từng lĩnh vực, mang đầy đủ đồ nghề chuyên dụng và sẵn sàng có mặt hỗ trợ gia đình bạn.
          </p>
        </div>

        {/* Services Grid Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {servicesData.map((service) => {
            const Icon = service.icon;
            return (
              <div
                key={service.id}
                className="group rounded-3xl bg-white border border-slate-200/90 hover:border-orange-400 overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col"
              >
                {/* Image Container with tag */}
                <div className="relative h-52 w-full overflow-hidden bg-slate-100">
                  <img
                    src={service.image}
                    alt={service.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-transparent to-transparent" />

                  {/* Top badges */}
                  <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                    <span
                      className={`text-[11px] font-extrabold px-3 py-1 rounded-full shadow-xs ${service.tagColor}`}
                    >
                      {service.tag}
                    </span>
                    <span className="text-xs font-black bg-white/95 backdrop-blur-md text-slate-900 px-3 py-1 rounded-full shadow-xs">
                      {service.price}
                    </span>
                  </div>

                  {/* Floating Icon */}
                  <div className="absolute bottom-3 left-4 flex items-center gap-2 text-white">
                    <div className="w-9 h-9 rounded-xl bg-[#FF5E14] text-white flex items-center justify-center shadow-md">
                      <Icon className="w-5 h-5" />
                    </div>
                    <h3 className="text-lg font-black tracking-tight drop-shadow-sm">
                      {service.name}
                    </h3>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {service.description}
                  </p>

                  {/* Highlights list */}
                  <div className="space-y-2 border-t border-slate-100 pt-3">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                      Các hạng mục phổ biến:
                    </span>
                    {service.highlights.map((h) => (
                      <div key={h} className="flex items-start gap-2 text-xs text-slate-700">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#FF5E14] shrink-0 mt-0.5" />
                        <span>{h}</span>
                      </div>
                    ))}
                  </div>

                  {/* Footer Action */}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={onOpenDownload}
                      className="w-full py-2.5 px-4 rounded-xl bg-orange-50 hover:bg-[#FF5E14] text-[#FF5E14] hover:text-white font-bold text-xs transition-colors flex items-center justify-center gap-2 group/btn"
                    >
                      <span>Đặt thợ trên App Handy Go</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover/btn:translate-x-1 transition-transform" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom Banner Note */}
        <div className="mt-14 p-6 rounded-3xl bg-slate-50 border border-slate-200/80 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-orange-100 text-[#FF5E14] flex items-center justify-center shrink-0">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-900">
                Bạn gặp sự cố phát sinh ngoài các danh mục trên?
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Chỉ cần mở app Handy Go, chụp ảnh khu vực bị lỗi và chọn Khảo sát tận nơi. Thợ sẽ tới kiểm tra trực tiếp!
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenDownload}
            className="px-6 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs whitespace-nowrap shadow-sm"
          >
            Mở App Yêu Cầu Khảo Sát
          </button>
        </div>
      </div>
    </section>
  );
};
