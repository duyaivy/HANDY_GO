import React from 'react';
import {
  Smartphone,
  Navigation,
  ShieldCheck,
  Receipt,
  FileCheck2,
  
  ArrowRight,
 
} from 'lucide-react';

interface WhyMobileOnlyProps {
  onOpenDownload: () => void;
}

export const WhyMobileOnly: React.FC<WhyMobileOnlyProps> = ({ onOpenDownload }) => {
  const mobileBenefits = [
    {
      icon: Navigation,
      badge: 'Real-time GPS',
      title: 'Định vị thợ chính xác trong 15 phút',
      description:
        'Hệ thống thuật toán tự động quét bán kính 2km xung quanh nhà bạn, ghép thợ đang rảnh tay gần nhất. Bạn có thể theo dõi quãng đường thợ chạy xe tới nhà theo thời gian thực trên bản đồ.',
    },
    {
      icon: Receipt,
      badge: 'Khóa giá niêm yết',
      title: 'Báo giá chuẩn xác, chặn đứng chặt chém',
      description:
        'Thợ nhập tình trạng máy vào app, ứng dụng tự tính giá theo khung chuẩn đã được duyệt. Khách hàng bấm đồng ý trên điện thoại thì thợ mới được phép bắt đầu sửa.',
    },
    {
      icon: ShieldCheck,
      badge: 'Xác minh 100%',
      title: 'An tâm tuyệt đối khi thợ vào nhà',
      description:
        'Mỗi người thợ đều hiển thị đầy đủ hình ảnh chân dung, căn cước công dân đã xác thực, số lượng đơn đã làm và đánh giá sao từ các khách hàng trước đó.',
    },
    {
      icon: FileCheck2,
      badge: 'Bảo hành 1 chạm',
      title: 'Phiếu bảo hành điện tử 30 - 90 ngày',
      description:
        'Không sợ mất phiếu bảo hành giấy. Mọi dịch vụ đều tự động lưu trên app, phát sinh sự cố chỉ cần bấm "Yêu cầu bảo hành", thợ sẽ quay lại xử lý hoàn toàn miễn phí.',
    },
  ];

  return (
    <section id="mobile-app" className="py-20 lg:py-28 bg-white relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-50 border border-orange-200 text-[#FF5E14] text-xs font-bold uppercase tracking-wider">
            <Smartphone className="w-3.5 h-3.5" />
            <span>Trải Nghiệm Ứng Dụng Di Động</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight">
            Vì Sao Handy Go Chỉ Đặt Dịch Vụ Qua Điện Thoại?
          </h2>
          <p className="text-slate-600 text-base sm:text-lg">
            Để bảo vệ quyền lợi tối đa cho gia đình bạn, toàn bộ quy trình từ định vị, báo giá đến bảo hành đều được số hóa minh bạch 100% trên ứng dụng di động.
          </p>
        </div>

        {/* Big Feature Showcase with Dual Phone Visual */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Column: 4 Key Reasons */}
          <div className="lg:col-span-6 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {mobileBenefits.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className="p-5 rounded-3xl bg-slate-50 border border-slate-200/80 hover:border-orange-300 hover:bg-orange-50/20 transition-all space-y-3 group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-[#FF5E14] shadow-xs group-hover:scale-110 transition-transform">
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-white text-slate-700 border border-slate-200">
                        {item.badge}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-slate-900 leading-snug">
                      {item.title}
                    </h3>

                    <p className="text-xs text-slate-600 leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Quick Action Box */}
            <div className="p-6 rounded-3xl bg-linear-to-r from-slate-900 to-slate-800 text-white flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="space-y-1 text-center sm:text-left">
                <p className="text-xs font-bold text-orange-400 uppercase tracking-wider">
                  Tải ngay trong 30 giây
                </p>
                <h4 className="text-base font-bold text-white">
                  Tương thích hoàn hảo với iOS & Android
                </h4>
              </div>

              <button
                type="button"
                onClick={onOpenDownload}
                className="px-6 py-3 rounded-2xl bg-[#FF5E14] hover:bg-[#E04800] text-white font-bold text-xs shadow-md orange-glow flex items-center gap-2 whitespace-nowrap active:scale-95 transition-all"
              >
                <span>Nhận Link Tải App</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Right Column: Visual Showcase of Two Modern Mobile Phones in Perspective */}
          <div className="lg:col-span-6 relative flex justify-center items-center py-6">
            {/* Background luxury gradient circle */}
            <div className="absolute w-110 h-110 rounded-full bg-linear-to-tr from-orange-200/40 via-amber-100/30 to-transparent blur-2xl -z-10" />

            {/* Phone 1: GPS Live Map Tracker (Tilted left) */}
            <div className="w-65 sm:w-70 bg-slate-950 p-2.5 rounded-[46px] ring-1 ring-slate-800 shadow-2xl phone-shadow transform -rotate-3 hover:rotate-0 transition-transform duration-500">
              <div className="w-full bg-white rounded-[38px] overflow-hidden text-left p-3.5 space-y-3">
                {/* Dynamic island */}
                <div className="w-20 h-4 bg-black rounded-full mx-auto mb-1" />

                {/* Tracking Header */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">
                    Thợ đang di chuyển
                  </span>
                  <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full animate-pulse">
                    ● Trực tiếp
                  </span>
                </div>

                {/* Map Graphics */}
                <div className="h-32 bg-slate-100 rounded-xl relative overflow-hidden border border-slate-200">
                  <div className="absolute inset-0 bg-[radial-gradient(#94a3b8_1px,transparent_1px)] bg-size-[10px_10px]" />
                  {/* Street roads */}
                  <div className="absolute top-1/2 left-0 right-0 h-3 bg-slate-300 -translate-y-1/2" />
                  <div className="absolute left-1/2 top-0 bottom-0 w-3 bg-slate-300 -translate-x-1/2" />

                  {/* Marker 1: Customer */}
                  <div className="absolute top-[35%] right-[20%] text-xs">
                    🏠 <span className="text-[8px] bg-slate-900 text-white px-1 py-0.2 rounded font-bold">Nhà bạn</span>
                  </div>

                  {/* Marker 2: Tech */}
                  <div className="absolute top-[48%] left-[20%] text-xs flex items-center gap-1">
                    <span className="w-6 h-6 rounded-full bg-[#FF5E14] text-white flex items-center justify-center text-[10px] font-bold shadow-md">
                      🛵
                    </span>
                    <span className="text-[8px] bg-[#FF5E14] text-white px-1 py-0.2 rounded font-bold">
                      Còn 700m
                    </span>
                  </div>
                </div>

                {/* Info Card */}
                <div className="p-2.5 bg-orange-50/70 border border-orange-200/80 rounded-xl text-[10px] space-y-1">
                  <div className="flex items-center justify-between font-bold text-slate-900">
                    <span>Thợ Hoàng Văn Lâm</span>
                    <span className="text-[#FF5E14]">⭐ 4.98</span>
                  </div>
                  <p className="text-slate-500">Đang rẽ vào đường Nguyễn Hữu Cảnh</p>
                  <p className="text-[9px] font-bold text-emerald-600">Đến nhà bạn sau 8 phút</p>
                </div>
              </div>
            </div>

            {/* Phone 2: Digital Invoice & Instant 1-Touch Warranty (Tilted right & overlapping) */}
            <div className="w-65 sm:w-70 bg-slate-950 p-2.5 rounded-[46px] ring-1 ring-slate-800 shadow-2xl phone-shadow transform rotate-3 hover:rotate-0 transition-transform duration-500 -ml-12 mt-12 sm:mt-16 z-20">
              <div className="w-full bg-white rounded-[38px] overflow-hidden text-left p-3.5 space-y-3">
                {/* Dynamic island */}
                <div className="w-20 h-4 bg-black rounded-full mx-auto mb-1" />

                {/* Warranty Header */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">
                    Bảo hành kích hoạt
                  </span>
                  <span className="text-[9px] font-bold text-white bg-slate-900 px-1.5 py-0.5 rounded-full">
                    30 Ngày
                  </span>
                </div>

                {/* Verified Certificate Stamp */}
                <div className="p-3 bg-linear-to-br from-orange-500 to-[#FF772E] text-white rounded-xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                      Chứng nhận Handy Go
                    </span>
                    <ShieldCheck className="w-4 h-4 text-white" />
                  </div>
                  <p className="text-xs font-black">Xử lý chập điện & Thay Aptomat</p>
                  <p className="text-[9px] text-orange-100">Bảo hành miễn phí đến: 24/10/2026</p>
                </div>

                {/* Rating Prompt */}
                <div className="p-2 border border-slate-200 rounded-xl space-y-1 text-center">
                  <p className="text-[10px] font-bold text-slate-800">Đã thanh toán an toàn</p>
                  <p className="text-xs font-black text-[#FF5E14]">180.000đ (Đã khóa giá)</p>
                  <span className="inline-block text-[9px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-semibold">
                    ✓ Không phát sinh 1 đồng
                  </span>
                </div>

                <div className="w-full py-2 rounded-xl bg-slate-900 text-white text-center text-[10px] font-bold">
                  Yêu Cầu Hỗ Trợ 1-Chạm
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
