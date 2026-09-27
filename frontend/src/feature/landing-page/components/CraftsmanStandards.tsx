import React from "react";
import {
  ShieldCheck,
  UserCheck,
  Award,
  Sparkles,
  CheckCircle2,
  Briefcase,
  Star,
} from "lucide-react";
import Image from "next/image";

export const CraftsmanStandards: React.FC = () => {
  const standards = [
    {
      step: "01",
      icon: UserCheck,
      title: "Xác minh lý lịch tư pháp 100%",
      desc: "100% thợ đối tác đều phải nộp giấy xác nhận thông tin cư trú, căn cước công dân gắn chip và không có tiền án tiền sự được chứng thực.",
    },
    {
      step: "02",
      icon: Award,
      title: "Sát hạch tay nghề nghiêm ngặt",
      desc: "Kiểm tra tay nghề thực hành trực tiếp tại trung tâm đào tạo Handy Go bởi các kỹ sư đầu ngành có trên 10 năm kinh nghiệm.",
    },
    {
      step: "03",
      icon: Briefcase,
      title: "Đồng phục & Đồ nghề chuyên nghiệp",
      desc: "Thợ luôn mặc đồng phục cam Handy Go, đeo thẻ căn cước số, mang túi bọc giày cách ẩm bảo vệ sàn nhà và đầy đủ trang thiết bị đạt chuẩn an toàn.",
    },
    {
      step: "04",
      icon: ShieldCheck,
      title: "Bảo hiểm trách nhiệm 50.000.000đ",
      desc: "Mọi đơn hàng được bảo hiểm bồi thường toàn diện nếu xảy ra bất kỳ hư hại ngoài ý muốn nào với tài sản của gia đình bạn.",
    },
  ];

  return (
    <section
      id="standards"
      className="py-20 lg:py-28 bg-slate-900 text-white relative overflow-hidden"
    >
      {/* Glow ambient background */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-orange-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-400 text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Tiêu Chuẩn Thợ Vàng Handy Go</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight">
            Chỉ Những Người Thợ Xuất Sắc Nhất Được Phép Vào Nhà Bạn
          </h2>
          <p className="text-slate-400 text-base sm:text-lg">
            Chúng tôi hiểu rằng sự an tâm và lịch sự là điều quan trọng nhất khi
            đón một người thợ vào không gian riêng tư của gia đình.
          </p>
        </div>

        {/* 4 Standards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {standards.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.step}
                className="bg-slate-800/70 border border-slate-700/80 rounded-3xl p-6 hover:border-orange-500/60 transition-all space-y-4 relative group"
              >
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-2xl bg-[#FF5E14] text-white flex items-center justify-center shadow-lg shadow-orange-500/20 group-hover:scale-105 transition-transform">
                    <Icon className="w-6 h-6" />
                  </div>
                  <span className="text-2xl font-black text-slate-700 group-hover:text-orange-400 transition-colors">
                    {s.step}
                  </span>
                </div>

                <h3 className="text-lg font-black text-white leading-snug">
                  {s.title}
                </h3>

                <p className="text-xs text-slate-400 leading-relaxed">
                  {s.desc}
                </p>
              </div>
            );
          })}
        </div>

        {/* Real photo + Trust badge highlight banner */}
        <div className="mt-14 bg-linear-to-r from-slate-800/90 via-slate-800 to-slate-800/90 border border-slate-700 rounded-3xl p-8 lg:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-4 relative rounded-2xl overflow-hidden shadow-2xl h-64 lg:h-72">
            <Image
              src="https://images.unsplash.com/photo-1541888946425-d0fbb18086f6?w=800&auto=format&fit=crop&q=80"
              alt="Thợ Handy Go chuyên nghiệp"
              width={800}
              height={600}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-linear-to-t from-slate-950/80 via-transparent to-transparent" />
            <div className="absolute bottom-4 left-4 right-4 bg-slate-900/90 backdrop-blur-md p-3 rounded-xl border border-slate-700 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-white">
                  100% Đồng Phục & Thẻ
                </p>
                <p className="text-[10px] text-slate-400">
                  Được đào tạo văn hóa ứng xử
                </p>
              </div>
              <span className="flex items-center text-amber-400 text-xs font-bold">
                <Star className="w-3.5 h-3.5 fill-amber-400 mr-1" /> 4.95/5
              </span>
            </div>
          </div>

          <div className="lg:col-span-8 space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">
              <CheckCircle2 className="w-4 h-4" />
              <span>Chính sách kiểm soát chất lượng 5 sao</span>
            </div>

            <h3 className="text-2xl sm:text-3xl font-black text-white">
              Nếu Khách Hàng Không Hài Lòng Về Tay Nghề Thợ?
            </h3>

            <p className="text-slate-300 text-sm leading-relaxed">
              Handy Go cam kết cử ngay kỹ sư bậc cao tới bảo hành khắc phục miễn
              phí 100% trong vòng 24 giờ. Trường hợp phát hiện thợ tự ý thu tiền
              vượt quá giá niêm yết trên ứng dụng điện thoại hoặc có thái độ
              không đúng mực, hệ thống sẽ hoàn tiền đơn hàng và xử lý kỷ luật
              nghiêm khắc.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-2">
              <div className="border border-slate-700 rounded-xl p-3 bg-slate-900/60">
                <p className="text-xl font-black text-[#FF5E14]">99.2%</p>
                <p className="text-[11px] text-slate-400">
                  Khách hàng đánh giá hài lòng
                </p>
              </div>
              <div className="border border-slate-700 rounded-xl p-3 bg-slate-900/60">
                <p className="text-xl font-black text-emerald-400">
                  30 - 90 Ngày
                </p>
                <p className="text-[11px] text-slate-400">
                  Bảo hành điện tử tận nhà
                </p>
              </div>
              <div className="border border-slate-700 rounded-xl p-3 bg-slate-900/60 col-span-2 sm:col-span-1">
                <p className="text-xl font-black text-amber-400">0 Đồng</p>
                <p className="text-[11px] text-slate-400">
                  Không phát sinh vô lý
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
