import React, { useState } from 'react';
import {
  Wrench,
  DollarSign,
  Calendar,
  ShieldCheck,
  CheckCircle2,
  
  Smartphone,
  Send,

} from 'lucide-react';

export const PartnerRecruitment: React.FC = () => {
  const [partnerName, setPartnerName] = useState('');
  const [partnerPhone, setPartnerPhone] = useState('');
  const [partnerTrade, setPartnerTrade] = useState('dien-lanh');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (partnerPhone.length >= 9 && partnerName.trim()) {
      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        setPartnerName('');
        setPartnerPhone('');
      }, 5000);
    }
  };

  return (
    <section id="partner" className="py-20 lg:py-28 bg-slate-50 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-linear-to-br from-slate-900 via-slate-900 to-slate-800 rounded-3xl p-8 sm:p-12 lg:p-16 border border-slate-700/80 shadow-2xl relative overflow-hidden">
          {/* Background graphics */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-orange-500/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center relative z-10">
            {/* Left Column: Value Prop for Craftsmen */}
            <div className="lg:col-span-7 space-y-6 text-white">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/20 border border-orange-500/40 text-orange-400 text-xs font-bold uppercase tracking-wider">
                <Wrench className="w-3.5 h-3.5" />
                <span>Gia Nhập Cộng Đồng Thợ Handy Go</span>
              </div>

              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight">
                Thu Nhập 18 – 35 Triệu/Tháng Cho Thợ Lành Nghề
              </h2>

              <p className="text-slate-300 text-base leading-relaxed">
                Bạn có tay nghề điện nước, điện lạnh, sửa khóa hoặc thợ mộc? Hãy trở thành đối tác Handy Go để nhận đơn việc dồi dào mỗi ngày ngay gần nhà, chủ động thời gian và không lo bị quỵt tiền.
              </p>

              {/* Benefits list */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="flex items-start gap-3 bg-slate-800/60 p-3.5 rounded-2xl border border-slate-700/70">
                  <div className="w-9 h-9 rounded-xl bg-[#FF5E14] text-white flex items-center justify-center shrink-0">
                    <DollarSign className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Đơn hàng dồi dào</h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Hơn 5.000 yêu cầu sửa chữa mỗi ngày, tự do nhận việc theo tuyến đường.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-slate-800/60 p-3.5 rounded-2xl border border-slate-700/70">
                  <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Linh hoạt thời gian</h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Bật app khi muốn làm, tắt app khi bận rộn. Bạn hoàn toàn là ông chủ của chính mình.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-slate-800/60 p-3.5 rounded-2xl border border-slate-700/70">
                  <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Bảo hiểm nghề nghiệp</h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Được trang bị bảo hiểm tai nạn lao động trọn gói trong quá trình làm việc.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-slate-800/60 p-3.5 rounded-2xl border border-slate-700/70">
                  <div className="w-9 h-9 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">App Thợ chuyên nghiệp</h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Giao diện Handy Go Partner tiếng Việt dễ dùng, tiền công về ví trong ngày.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Quick Register Form */}
            <div className="lg:col-span-5 bg-white rounded-3xl p-6 sm:p-8 text-slate-900 shadow-2xl space-y-5">
              <div className="space-y-1">
                <span className="text-xs font-extrabold uppercase tracking-wider text-[#FF5E14]">
                  Đăng ký tuyển dụng thợ
                </span>
                <h3 className="text-2xl font-black text-slate-900">
                  Đăng Ký Tham Gia Đội Ngũ
                </h3>
                <p className="text-xs text-slate-500">
                  Bộ phận tuyển dụng Handy Go sẽ gọi lại phỏng vấn trong vòng 24h.
                </p>
              </div>

              {submitted ? (
                <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-2xl text-center space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                  <h4 className="text-base font-bold text-emerald-900">
                    Gửi thông tin thành công!
                  </h4>
                  <p className="text-xs text-emerald-700">
                    Cảm ơn anh {partnerName}. Chuyên viên tuyển dụng Handy Go sẽ liên hệ qua số {partnerPhone} để hẹn lịch sát hạch tay nghề.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Họ và tên của bạn *
                    </label>
                    <input
                      type="text"
                      required
                      value={partnerName}
                      onChange={(e) => setPartnerName(e.target.value)}
                      placeholder="Ví dụ: Nguyễn Văn Hùng"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF5E14]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Số điện thoại liên hệ (Zalo) *
                    </label>
                    <input
                      type="tel"
                      required
                      value={partnerPhone}
                      onChange={(e) => setPartnerPhone(e.target.value)}
                      placeholder="Ví dụ: 0908 123 456"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF5E14]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Lĩnh vực tay nghề sở trường *
                    </label>
                    <select
                      value={partnerTrade}
                      onChange={(e) => setPartnerTrade(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#FF5E14] bg-white"
                    >
                      <option value="dien-lanh">Điện lạnh (Máy lạnh, tủ lạnh, máy giặt)</option>
                      <option value="dien-dan-dung">Điện dân dụng (Chập điện, đi dây, đèn)</option>
                      <option value="nuoc">Cấp thoát nước (Rò rỉ ống, thông cống, vòi)</option>
                      <option value="khoa">Sửa khóa & Cửa cuốn thông minh</option>
                      <option value="go-co-khi">Đồ gỗ & Hàn cơ khí nhôm sắt</option>
                      <option value="son-cai-tao">Sơn nhà, thạch cao & cải tạo</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3.5 px-4 rounded-xl bg-linear-to-r from-[#FF5E14] to-[#FF772E] text-white font-extrabold text-sm shadow-md orange-glow hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    <span>Nộp Đơn Ứng Tuyển Thợ</span>
                  </button>

                  <div className="pt-2 text-center">
                    <p className="text-[11px] text-slate-400">
                      Hoặc liên hệ Hotline tuyển dụng:{' '}
                      <a href="tel:0908889900" className="text-[#FF5E14] font-bold underline">
                        0908 88 99 00
                      </a>
                    </p>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
