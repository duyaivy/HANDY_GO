import React, { useState } from 'react';
import { ChevronDown, HelpCircle,  } from 'lucide-react';

export const FAQSection: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    {
      q: 'Vì sao Handy Go chỉ cho phép khách hàng đặt dịch vụ trên điện thoại?',
      a: 'Để đảm bảo an toàn và quyền lợi tuyệt đối cho bạn. Ứng dụng di động giúp hệ thống xác định vị trí GPS chính xác để cử thợ gần nhất trong 15 phút, lưu trữ phiếu bảo hành điện tử 30 - 90 ngày và tự động khóa giá niêm yết minh bạch. Bạn có thể theo dõi thợ trên bản đồ và gọi lại bảo hành chỉ bằng 1 chạm mà không cần giữ giấy tờ biên nhận dễ thất lạc.',
    },
    {
      q: 'Chi phí có bị phát sinh thêm so với giá niêm yết trên ứng dụng không?',
      a: 'Hoàn toàn không! Mọi dịch vụ đều có khung giá chuẩn công khai trên app. Khi thợ đến khảo sát thực tế, thợ sẽ nhập đúng hạng mục vào app. Chỉ khi bạn bấm xác nhận "Đồng ý giá" trên màn hình điện thoại thì thợ mới được phép làm việc. Nếu thợ tự ý đòi thêm bất kỳ phụ phí nào, bạn hãy liên hệ tổng đài 1900 8899 để được hoàn tiền 100%.',
    },
    {
      q: 'Chính sách bảo hành điện tử của Handy Go hoạt động ra sao?',
      a: 'Sau khi thợ hoàn tất và bạn xác nhận nghiệm thu, phiếu bảo hành điện tử có mã số riêng sẽ hiển thị trong mục "Bảo hành" trên app Handy Go của bạn (thời hạn từ 30 đến 90 ngày tùy dịch vụ). Nếu thiết bị tái phát lỗi, bạn chỉ cần bấm "Yêu cầu bảo hành lại", kỹ sư của chúng tôi sẽ có mặt trong vòng 24 giờ để khắc phục hoàn toàn miễn phí.',
    },
    {
      q: 'Thợ của Handy Go có đáng tin cậy khi vào nhà khách không?',
      a: '100% thợ đối tác của Handy Go đều trải qua quy trình sàng lọc 5 bước: Kiểm tra căn cước công dân gắn chip, xác minh lý lịch tư pháp không tiền án tiền sự, sát hạch tay nghề thực tế và tập huấn văn hóa ứng xử lịch sự. Khi đến nhà bạn, thợ luôn mặc đồng phục cam Handy Go, đeo thẻ căn cước số và mang bọc giày cách ẩm bảo vệ sàn nhà.',
    },
    {
      q: 'Handy Go có phục vụ vào ban đêm hoặc ngày cuối tuần, lễ Tết không?',
      a: 'Có. Đội ngũ thợ Handy Go trực chiến 24/7 đối với các dịch vụ cứu hộ khẩn cấp như: chập cháy nổ điện nguy hiểm, vỡ ống nước ngập nhà, hoặc kẹt khóa cửa không vào nhà được. Bạn có thể mở app đặt thợ bất kỳ lúc nào.',
    },
    {
      q: 'Tôi có thể thanh toán bằng những hình thức nào?',
      a: 'Ứng dụng hỗ trợ đa dạng phương thức thanh toán an toàn: Quét mã VietQR chuyển khoản tức thì, thanh toán qua thẻ tín dụng/ghi nợ (Visa, Mastercard), ví điện tử MoMo/ZaloPay, hoặc thanh toán tiền mặt trực tiếp cho thợ sau khi nghiệm thu hài lòng.',
    },
  ];

  return (
    <section id="faq" className="py-20 lg:py-28 bg-slate-50 relative">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-orange-100 text-[#FF5E14] text-xs font-bold uppercase tracking-wider">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Giải Đáp Thắc Mắc</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight">
            Câu Hỏi Thường Gặp
          </h2>
          <p className="text-slate-600 text-base sm:text-lg">
            Mọi thông tin bạn cần biết về ứng dụng gọi thợ công nghệ Handy Go.
          </p>
        </div>

        {/* FAQ Accordion */}
        <div className="space-y-3.5">
          {faqs.map((item, index) => {
            const isOpen = openIndex === index;
            return (
              <div
                key={item.q}
                className="rounded-2xl border border-slate-200/90 bg-white overflow-hidden transition-all shadow-xs"
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  className="w-full p-5 sm:p-6 text-left flex items-center justify-between gap-4 font-bold text-slate-900 hover:text-[#FF5E14] transition-colors"
                >
                  <span className="text-sm sm:text-base">{item.q}</span>
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-transform ${
                      isOpen ? 'bg-[#FF5E14] text-white rotate-180' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </button>

                {isOpen && (
                  <div className="px-5 sm:px-6 pb-6 pt-1 text-slate-600 text-xs sm:text-sm leading-relaxed border-t border-slate-100 animate-fadeIn">
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Still have questions banner */}
        <div className="mt-12 text-center p-6 rounded-3xl bg-white border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-center sm:text-left">
            <h4 className="text-sm font-bold text-slate-900">
              Bạn vẫn còn câu hỏi khác cần tư vấn trực tiếp?
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Tổng đài chăm sóc khách hàng Handy Go luôn sẵn sàng hỗ trợ 24/7.
            </p>
          </div>

          <a
            href="tel:19008899"
            className="px-6 py-2.5 rounded-xl bg-[#FF5E14] text-white font-bold text-xs shadow-xs hover:bg-[#E04800] transition-colors whitespace-nowrap"
          >
            Gọi Tổng Đài 1900 8899
          </a>
        </div>
      </div>
    </section>
  );
};
