import React, { useState } from 'react';
import {
  Wrench,
  Zap,
  Droplets,
  Wind,
  Key,
  Hammer,
  MapPin,
  Clock,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  Smartphone,
  ChevronRight,
  TrendingDown,
  type LucideIcon,
} from 'lucide-react';
interface ServiceEstimatorProps {
  onOpenDownload: () => void;
}

interface ServiceCategory {
  id: string;
  name: string;
  icon: LucideIcon;
  items: {
    title: string;
    avgPrice: string;
    timeRequired: string;
    warranty: string;
    popular?: boolean;
  }[];
}
const serviceCategories: ServiceCategory[] = [
  {
    id: 'dien-lanh',
    name: 'Điện Lạnh & Máy Giặt',
    icon: Wind,
    items: [
      {
        title: 'Vệ sinh máy lạnh treo tường (Khử khuẩn nano)',
        avgPrice: '150.000đ - 200.000đ / máy',
        timeRequired: '30 - 45 phút',
        warranty: '30 ngày',
        popular: true,
      },
      {
        title: 'Bơm nạp gas máy lạnh R32 / R410A chính hãng',
        avgPrice: '120.000đ - 250.000đ',
        timeRequired: '20 phút',
        warranty: '60 ngày',
      },
      {
        title: 'Sửa máy lạnh chảy nước, không lạnh, kêu to',
        avgPrice: '200.000đ - 350.000đ',
        timeRequired: '40 - 60 phút',
        warranty: '90 ngày',
      },
      {
        title: 'Vệ sinh bảo dưỡng máy giặt cửa ngang/cửa trên',
        avgPrice: '250.000đ - 380.000đ / máy',
        timeRequired: '60 phút',
        warranty: '30 ngày',
      },
    ],
  },
  {
    id: 'dien-dan-dung',
    name: 'Hệ Thống Điện Dân Dụng',
    icon: Zap,
    items: [
      {
        title: 'Xử lý sự cố chập điện, nhảy aptomat khẩn cấp',
        avgPrice: '150.000đ - 300.000đ',
        timeRequired: '30 - 60 phút',
        warranty: '60 ngày',
        popular: true,
      },
      {
        title: 'Lắp đặt quạt trần, đèn chùm, đèn ray trang trí',
        avgPrice: '100.000đ - 250.000đ / điểm',
        timeRequired: '30 - 45 phút',
        warranty: '30 ngày',
      },
      {
        title: 'Thay ổ cắm, công tắc, đi dây điện âm/nổi an toàn',
        avgPrice: '80.000đ - 180.000đ / vị trí',
        timeRequired: '25 phút',
        warranty: '60 ngày',
      },
      {
        title: 'Kiểm tra toàn bộ hệ thống điện rò rỉ phòng cháy nổ',
        avgPrice: '200.000đ - 350.000đ',
        timeRequired: '45 phút',
        warranty: '30 ngày',
      },
    ],
  },
  {
    id: 'cap-thoat-nuoc',
    name: 'Cấp Thoát Nước & Vệ Sinh',
    icon: Droplets,
    items: [
      {
        title: 'Sửa đường ống nước bị rò rỉ, vỡ âm tường',
        avgPrice: '150.000đ - 350.000đ',
        timeRequired: '30 - 60 phút',
        warranty: '90 ngày',
        popular: true,
      },
      {
        title: 'Thông tắc lavabo, bồn rửa chén, bồn cầu',
        avgPrice: '150.000đ - 300.000đ',
        timeRequired: '30 phút',
        warranty: '30 ngày',
      },
      {
        title: 'Thay vòi sen tắm, vòi xịt, van khóa nước',
        avgPrice: '80.000đ - 150.000đ / bộ',
        timeRequired: '20 phút',
        warranty: '30 ngày',
      },
      {
        title: 'Lắp đặt hoặc sửa chữa máy bơm nước tăng áp',
        avgPrice: '200.000đ - 400.000đ',
        timeRequired: '45 phút',
        warranty: '60 ngày',
      },
    ],
  },
  {
    id: 'khoa-cua',
    name: 'Sửa Khóa & Cửa Cuốn',
    icon: Key,
    items: [
      {
        title: 'Mở khóa cửa nhà, phòng ngủ, tủ khóa khẩn cấp 24/7',
        avgPrice: '120.000đ - 250.000đ',
        timeRequired: '15 - 25 phút',
        warranty: 'Trực tiếp',
        popular: true,
      },
      {
        title: 'Lắp đặt hoặc thay khóa cửa vân tay thông minh',
        avgPrice: '250.000đ - 500.000đ / bộ',
        timeRequired: '60 - 90 phút',
        warranty: '12 tháng',
      },
      {
        title: 'Sửa motor cửa cuốn, remote điều khiển từ xa kẹt',
        avgPrice: '250.000đ - 450.000đ',
        timeRequired: '40 phút',
        warranty: '60 ngày',
      },
      {
        title: 'Thay tay nắm gạt, chốt an toàn cửa nhôm kính',
        avgPrice: '90.000đ - 180.000đ',
        timeRequired: '25 phút',
        warranty: '30 ngày',
      },
    ],
  },
  {
    id: 'go-noi-that',
    name: 'Đồ Gỗ & Cơ Khí Nhôm',
    icon: Hammer,
    items: [
      {
        title: 'Sửa bản lề tủ bếp, ray trượt ngăn kéo xệ kẹt',
        avgPrice: '90.000đ - 180.000đ',
        timeRequired: '30 phút',
        warranty: '30 ngày',
        popular: true,
      },
      {
        title: 'Tháo lắp, di dời giường tủ nội thất gia đình',
        avgPrice: '250.000đ - 500.000đ / món',
        timeRequired: '60 - 120 phút',
        warranty: '30 ngày',
      },
      {
        title: 'Hàn sửa cửa sắt, gia cố ban công, tay vịn cầu thang',
        avgPrice: '200.000đ - 450.000đ',
        timeRequired: '45 - 90 phút',
        warranty: '90 ngày',
      },
    ],
  },
];

const locations = [
  { id: 'hcm-binhthanh', name: 'TP. HCM - Quận Bình Thạnh', availableTechs: 34, eta: '12 - 15 phút' },
  { id: 'hcm-q1', name: 'TP. HCM - Quận 1 & Quận 3', availableTechs: 42, eta: '10 - 14 phút' },
  { id: 'hcm-q7', name: 'TP. HCM - Quận 7 & Nhà Bè', availableTechs: 28, eta: '15 - 20 phút' },
  { id: 'hcm-thuduc', name: 'TP. HCM - TP. Thủ Đức', availableTechs: 56, eta: '12 - 18 phút' },
  { id: 'hn-caugiay', name: 'Hà Nội - Cầu Giấy & Đống Đa', availableTechs: 38, eta: '10 - 15 phút' },
  { id: 'hn-tayho', name: 'Hà Nội - Ba Đình & Tây Hồ', availableTechs: 26, eta: '15 - 20 phút' },
  { id: 'dn-haichau', name: 'Đà Nẵng - Hải Châu & Thanh Khê', availableTechs: 22, eta: '12 - 16 phút' },
  { id: 'bd-thuanan', name: 'Bình Dương - Dĩ An & Thuận An', availableTechs: 29, eta: '15 - 20 phút' },
];

export const ServiceEstimator: React.FC<ServiceEstimatorProps> = ({ onOpenDownload }) => {
  const [selectedCatId, setSelectedCatId] = useState('dien-lanh');
  const [selectedLocId, setSelectedLocId] = useState('hcm-binhthanh');
  const [selectedItemIndex, setSelectedItemIndex] = useState(0);

  const activeCategory =
    serviceCategories.find((c) => c.id === selectedCatId) || serviceCategories[0];
  const activeLocation =
    locations.find((l) => l.id === selectedLocId) || locations[0];
  const activeItem = activeCategory.items[selectedItemIndex] || activeCategory.items[0];

  return (
    <section id="estimator" className="py-20 lg:py-28 bg-slate-50 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-14 space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-100 text-[#FF5E14] text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Minh Bạch Tuyệt Đối</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight">
            Tra Cứu Bảng Giá & Thợ Trực Tuyến
          </h2>
          <p className="text-slate-600 text-base sm:text-lg">
            Không lo chặt chém hay phát sinh chi phí vô lý. Tất cả dịch vụ trên Handy Go đều được kiểm soát và niêm yết rõ ràng trước khi đặt lịch trên điện thoại.
          </p>
        </div>

        {/* Interactive Estimator Layout */}
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xl overflow-hidden">
          {/* Top category tabs */}
          <div className="flex overflow-x-auto scrollbar-none border-b border-slate-200/80 bg-slate-50/70 p-2 gap-2">
            {serviceCategories.map((cat) => {
              const Icon = cat.icon;
              const isActive = cat.id === selectedCatId;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setSelectedCatId(cat.id);
                    setSelectedItemIndex(0);
                  }}
                  className={`flex items-center gap-2.5 px-5 py-3 rounded-2xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-white text-[#FF5E14] shadow-sm border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-[#FF5E14]' : 'text-slate-500'}`} />
                  <span>{cat.name}</span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 p-6 sm:p-8 gap-8 items-start">
            {/* Left list of services under category */}
            <div className="lg:col-span-7 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Chọn công việc cụ thể:
                </span>

                {/* Location selector dropdown */}
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[#FF5E14]" />
                  <select
                    value={selectedLocId}
                    onChange={(e) => setSelectedLocId(e.target.value)}
                    className="text-xs font-bold text-slate-800 bg-slate-100 border border-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#FF5E14]"
                  >
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Service item buttons */}
              <div className="space-y-2.5">
                {activeCategory.items.map((item, index) => {
                  const isSelected = selectedItemIndex === index;
                  return (
                    <div
                      key={item.title}
                      onClick={() => setSelectedItemIndex(index)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'border-[#FF5E14] bg-orange-50/50 shadow-xs ring-1 ring-[#FF5E14]'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-slate-900 leading-snug">
                            {item.title}
                          </h4>
                          {item.popular && (
                            <span className="text-[10px] font-extrabold bg-[#FF5E14] text-white px-2 py-0.5 rounded-full">
                              Phổ biến
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-slate-500">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-slate-400" /> {item.timeRequired}
                          </span>
                          <span className="flex items-center gap-1 text-emerald-600 font-medium">
                            <ShieldCheck className="w-3.5 h-3.5" /> BH {item.warranty}
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="text-sm font-black text-[#FF5E14]">{item.avgPrice}</p>
                        <span className="text-[10px] text-slate-400">Giá niêm yết</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 text-xs text-slate-600 flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  Báo giá đã bao gồm công thợ kiểm tra. Thợ chỉ thực hiện sau khi gia đình xác nhận đồng ý trên app.
                </span>
              </div>
            </div>

            {/* Right Live Summary & Instant Dispatch Card */}
            <div className="lg:col-span-5 bg-linear-to-br from-slate-900 to-slate-800 text-white rounded-3xl p-6 sm:p-7 shadow-xl space-y-6 relative overflow-hidden">
              {/* Card Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-700/80">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                    Sẵn sàng điều phối
                  </span>
                </div>
                <span className="text-xs font-mono text-slate-400">HandyGo Dispatch</span>
              </div>

              {/* Real-time stats for selected location */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-3.5">
                  <p className="text-[11px] text-slate-400 font-medium">Thợ sẵn sàng gần bạn</p>
                  <p className="text-2xl font-black text-white mt-0.5">
                    {activeLocation.availableTechs} <span className="text-xs text-orange-400 font-normal">thợ</span>
                  </p>
                </div>
                <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-3.5">
                  <p className="text-[11px] text-slate-400 font-medium">Dự kiến có mặt</p>
                  <p className="text-2xl font-black text-emerald-400 mt-0.5">
                    ~{activeLocation.eta}
                  </p>
                </div>
              </div>

              {/* Selected service details */}
              <div className="space-y-3 bg-white/5 rounded-2xl p-4 border border-white/10">
                <div className="text-xs text-slate-300">Công việc đã chọn:</div>
                <h3 className="text-base font-bold text-white leading-snug">
                  {activeItem.title}
                </h3>

                <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                  <span className="text-xs text-slate-400">Khoảng giá ước tính:</span>
                  <span className="text-lg font-black text-[#FFA048]">
                    {activeItem.avgPrice}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Chính sách bảo hành:</span>
                  <span className="text-white font-semibold">Tận nhà {activeItem.warranty}</span>
                </div>
              </div>

              {/* CTA strictly emphasizing mobile app booking */}
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={onOpenDownload}
                  className="w-full py-3.5 px-4 rounded-2xl bg-linear-to-r from-[#FF5E14] via-[#FF6F22] to-[#FFA048] text-white font-extrabold text-sm shadow-lg orange-glow hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  <Smartphone className="w-4 h-4" />
                  <span>Mở App Đặt Thợ Này Ngay</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
                <p className="text-[11px] text-center text-slate-400">
                  📱 Thao tác đặt dịch vụ chỉ thực hiện qua app để bảo đảm định vị GPS & bảo hành
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
