import React from 'react';
import {
  Smartphone,
  
  ShieldCheck,
  ArrowRight,
  Sparkles,
  Camera,
  Compass,
 
} from 'lucide-react';

interface HowItWorksProps {
  onOpenDownload: () => void;
}

export const HowItWorks: React.FC<HowItWorksProps> = ({ onOpenDownload }) => {
  const steps = [
    {
      num: '01',
      title: 'Chọn dịch vụ & gửi hình ảnh',
      desc: 'Mở ứng dụng Handy Go trên điện thoại, chọn hạng mục cần sửa chữa, chụp ảnh hoặc quay video ngắn mô tả lỗi để thợ chuẩn bị sẵn linh kiện phù hợp.',
      icon: Camera,
      tag: 'Chỉ 60 giây',
    },
    {
      num: '02',
      title: 'Ghép thợ gần nhất & theo dõi GPS',
      desc: 'Hệ thống tự động tìm thợ lành nghề trong bán kính 2km. Bạn có thể theo dõi xe thợ di chuyển trên bản đồ trực tiếp và liên lạc thợ chỉ bằng 1 chạm.',
      icon: Compass,
      tag: 'Có mặt 15 phút',
    },
    {
      num: '03',
      title: 'Khảo sát & khóa giá niêm yết trên app',
      desc: 'Thợ đến kiểm tra thực tế, báo giá chuẩn xác theo khung niêm yết trên app. Khi bạn nhấn "Đồng ý" trên màn hình điện thoại thì thợ mới bắt đầu sửa chữa.',
      icon: Smartphone,
      tag: 'Không phát sinh',
    },
    {
      num: '04',
      title: 'Nghiệm thu & nhận bảo hành điện tử',
      desc: 'Sau khi hoàn thành và chạy thử máy êm ái, bạn xác nhận nghiệm thu. Phiếu bảo hành 30 - 90 ngày tự động gửi về ứng dụng Handy Go của bạn.',
      icon: ShieldCheck,
      tag: 'Bảo hành 30 ngày',
    },
  ];

  return (
    <section className="py-20 lg:py-28 bg-white relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-orange-50 border border-orange-200 text-[#FF5E14] text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Quy Trình Siêu Nhanh</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight">
            Gọi Thợ Tận Nhà Đơn Giản Trong 4 Bước
          </h2>
          <p className="text-slate-600 text-base sm:text-lg">
            Mọi thao tác đều được tối ưu trên ứng dụng điện thoại để người lớn tuổi hay người bận rộn đều dễ dàng sử dụng.
          </p>
        </div>

        {/* Steps Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 relative">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            return (
              <div
                key={step.num}
                className="relative bg-slate-50 border border-slate-200/90 rounded-3xl p-6 flex flex-col justify-between hover:border-orange-400 hover:bg-orange-50/20 transition-all duration-300 group shadow-xs hover:shadow-md"
              >
                {/* Top Badge and Step Number */}
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 text-[#FF5E14] flex items-center justify-center shadow-xs group-hover:bg-[#FF5E14] group-hover:text-white transition-all">
                    <Icon className="w-6 h-6" />
                  </div>
                  <span className="text-3xl font-black text-slate-300 group-hover:text-orange-400 transition-colors">
                    {step.num}
                  </span>
                </div>

                <div className="space-y-2 mb-4">
                  <span className="inline-block text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-orange-100 text-[#FF5E14]">
                    {step.tag}
                  </span>
                  <h3 className="text-base font-bold text-slate-900 leading-snug">
                    {step.title}
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {step.desc}
                  </p>
                </div>

                {/* Progress dot indicator */}
                <div className="pt-2 border-t border-slate-200/60 flex items-center gap-1.5 text-[11px] text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-[#FF5E14]" />
                  <span>Bước {idx + 1} của 4</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* CTA Bar below steps */}
        <div className="mt-14 text-center">
          <button
            type="button"
            onClick={onOpenDownload}
            className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl bg-linear-to-r from-[#FF5E14] to-[#FF772E] text-white font-extrabold text-sm shadow-xl orange-glow hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            <Smartphone className="w-5 h-5" />
            <span>Trải Nghiệm Gọi Thợ Trên App Handy Go Ngay</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </section>
  );
};
