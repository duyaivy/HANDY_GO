import type { ServiceSuggestionGroup } from '../src/common/dto/suggestion-group.dto.js';

export interface CategoryPresetDefinition {
  code: string;
  sampleId: string;
  sampleName: string;
  sampleDescription: string;
  keywords: string[];
  suggestionGroups: ServiceSuggestionGroup[];
}

export interface ServicePresetDefinition {
  code: string;
  serviceIds: string[];
  keywords: string[];
  excludeKeywords?: string[];
  suggestionGroups: ServiceSuggestionGroup[];
}

export interface SampleCatalogServiceSeed {
  id: string;
  name: string;
  categoryCode: string;
  description: string;
}

/**
 * Normalize Vietnamese string to lowercase ASCII without diacritics for resilient keyword matching.
 */
export function normalizeViText(input?: string | null): string {
  if (!input) {
    return '';
  }
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const DEFAULT_FALLBACK_SUGGESTION_GROUPS: ServiceSuggestionGroup[] = [
  {
    key: 'need',
    label: 'Nhu cầu dịch vụ',
    descriptionPrefix: 'Nhu cầu',
    selectionMode: 'single',
    options: [
      'Kiểm tra & sửa chữa',
      'Bảo dưỡng / vệ sinh',
      'Lắp đặt / thay mới',
      'Tư vấn & khảo sát',
      'Chưa rõ',
    ],
  },
  {
    key: 'location',
    label: 'Khu vực thực hiện',
    descriptionPrefix: 'Khu vực',
    selectionMode: 'single',
    options: [
      'Nhà ở / Căn hộ',
      'Cửa hàng / Văn phòng',
      'Khu vực ngoài trời',
      'Chưa rõ',
    ],
  },
  {
    key: 'severity',
    label: 'Mức độ ưu tiên',
    descriptionPrefix: 'Mức độ',
    selectionMode: 'single',
    options: ['Bình thường', 'Cần trong ngày', 'Khẩn cấp', 'Chưa rõ'],
  },
];

/**
 * 12 Category-level suggestion group presets covering all standard Vietnamese home service domains.
 */
export const CATEGORY_SUGGESTION_PRESETS: CategoryPresetDefinition[] = [
  {
    code: 'ac_cooling',
    sampleId: '10000000-0000-4000-8000-000000000001',
    sampleName: 'Điện lạnh',
    sampleDescription:
      'Dịch vụ vệ sinh, bảo dưỡng, sửa chữa và lắp đặt máy lạnh, tủ lạnh',
    keywords: [
      'dien lanh',
      'may lanh',
      'dieu hoa',
      'tu lanh',
      'tu dong',
      'tu mat',
      'lam lanh',
    ],
    suggestionGroups: [
      {
        key: 'issue',
        label: 'Tình trạng thiết bị',
        descriptionPrefix: 'Tình trạng',
        selectionMode: 'single',
        options: [
          'Không lạnh / yếu lạnh',
          'Chảy nước / đóng tuyết',
          'Kêu to / rung mạnh',
          'Không lên nguồn',
          'Cần vệ sinh / bảo dưỡng',
          'Chưa rõ',
        ],
      },
      {
        key: 'device_type',
        label: 'Loại thiết bị',
        descriptionPrefix: 'Thiết bị',
        selectionMode: 'single',
        options: [
          'Máy lạnh treo tường',
          'Máy lạnh âm trần / tủ đứng',
          'Tủ lạnh thường / Inverter',
          'Tủ lạnh Side-by-Side / Tủ đông',
          'Chưa rõ',
        ],
      },
      {
        key: 'severity',
        label: 'Mức độ',
        descriptionPrefix: 'Mức độ',
        selectionMode: 'single',
        options: ['Bình thường', 'Cần trong ngày', 'Khẩn cấp', 'Chưa rõ'],
      },
    ],
  },
  {
    code: 'electricity',
    sampleId: '10000000-0000-4000-8000-000000000002',
    sampleName: 'Điện dân dụng & Chiếu sáng',
    sampleDescription:
      'Sửa chữa sự cố điện, lắp đặt hệ thống điện và đèn chiếu sáng',
    keywords: [
      'dien dan dung',
      'sua dien',
      'he thong dien',
      'chieu sang',
      'den dien',
      'aptomat',
      'chap dien',
    ],
    suggestionGroups: [
      {
        key: 'issue',
        label: 'Sự cố điện',
        descriptionPrefix: 'Sự cố',
        selectionMode: 'single',
        options: [
          'Mất điện cục bộ / nhảy CB (Aptomat)',
          'Chập điện / có mùi khét',
          'Ổ cắm / công tắc hỏng',
          'Đèn không sáng / chập chờn',
          'Đi lại dây / lắp mới thiết bị điện',
          'Chưa rõ',
        ],
      },
      {
        key: 'location',
        label: 'Khu vực',
        descriptionPrefix: 'Vị trí',
        selectionMode: 'single',
        options: [
          'Phòng khách / Phòng ngủ',
          'Nhà bếp / Nhà tắm',
          'Tủ điện tổng / Cầu thang',
          'Sân vườn / Ngoài trời',
          'Chưa rõ',
        ],
      },
      {
        key: 'severity',
        label: 'Mức độ',
        descriptionPrefix: 'Mức độ',
        selectionMode: 'single',
        options: [
          'Nhẹ (vẫn dùng tạm được)',
          'Trung bình (cần xử lý sớm)',
          'Khẩn cấp (mất điện / nguy cơ chập cháy)',
          'Chưa rõ',
        ],
      },
    ],
  },
  {
    code: 'plumbing',
    sampleId: '10000000-0000-4000-8000-000000000003',
    sampleName: 'Ống nước & Thiết bị vệ sinh',
    sampleDescription:
      'Sửa chữa đường ống nước, thông cống, bồn cầu và bảo trì hệ thống nước',
    keywords: [
      'ong nuoc',
      'dien nuoc',
      'cap thoat nuoc',
      'he thong nuoc',
      'thong cong',
      'bon cau',
      'thiet bi ve sinh',
      'chong tham',
    ],
    suggestionGroups: [
      {
        key: 'issue',
        label: 'Loại sự cố',
        descriptionPrefix: 'Sự cố',
        selectionMode: 'single',
        options: [
          'Rò rỉ / bể ống nước',
          'Tắc nghẽn / thoát nước chậm',
          'Nước yếu / mất nước',
          'Vòi nước / van khóa / phao hỏng',
          'Lắp đặt / thay mới thiết bị',
          'Chưa rõ',
        ],
      },
      {
        key: 'location',
        label: 'Vị trí',
        descriptionPrefix: 'Vị trí',
        selectionMode: 'single',
        options: [
          'Nhà tắm / WC',
          'Nhà bếp / Bồn rửa',
          'Bồn nước / Sân thượng',
          'Sân vườn / Hố ga',
          'Chưa rõ',
        ],
      },
      {
        key: 'severity',
        label: 'Mức độ',
        descriptionPrefix: 'Mức độ',
        selectionMode: 'single',
        options: [
          'Nhẹ (rỉ nhỏ / ít ảnh hưởng)',
          'Trung bình',
          'Khẩn cấp (tràn nước / không dùng được)',
          'Chưa rõ',
        ],
      },
    ],
  },
  {
    code: 'appliances',
    sampleId: '10000000-0000-4000-8000-000000000004',
    sampleName: 'Điện gia dụng',
    sampleDescription:
      'Sửa chữa, vệ sinh máy giặt và các thiết bị điện gia dụng trong gia đình',
    keywords: [
      'dien gia dung',
      'gia dung',
      'may giat',
      'may say',
      'binh nong lanh',
      'lo vi song',
      'bep tu',
      'may loc nuoc',
    ],
    suggestionGroups: [
      {
        key: 'issue',
        label: 'Tình trạng thiết bị',
        descriptionPrefix: 'Tình trạng',
        selectionMode: 'single',
        options: [
          'Không vào điện / không khởi động',
          'Hoạt động bất thường / báo lỗi',
          'Kêu to / rung lắc / có mùi khét',
          'Rò nước / không cấp hoặc thoát nước',
          'Cần vệ sinh / bảo dưỡng định kỳ',
          'Chưa rõ',
        ],
      },
      {
        key: 'appliance_type',
        label: 'Thiết bị cần hỗ trợ',
        descriptionPrefix: 'Thiết bị',
        selectionMode: 'single',
        options: [
          'Máy giặt / Máy sấy',
          'Bình nóng lạnh / Máy nước nóng',
          'Bếp từ / Lò vi sóng / Nồi chiên',
          'Máy lọc nước / Quạt điện',
          'Chưa rõ',
        ],
      },
      {
        key: 'severity',
        label: 'Mức độ',
        descriptionPrefix: 'Mức độ',
        selectionMode: 'single',
        options: ['Bình thường', 'Cần trong ngày', 'Khẩn cấp', 'Chưa rõ'],
      },
    ],
  },
  {
    code: 'electronics_it',
    sampleId: '10000000-0000-4000-8000-000000000005',
    sampleName: 'Điện tử, Máy tính & Mạng',
    sampleDescription:
      'Sửa tivi, âm thanh, máy tính, máy in và lắp đặt mạng Internet/WiFi',
    keywords: [
      'dien tu',
      'cntt',
      'may tinh',
      'laptop',
      'may in',
      'tivi',
      'am thanh',
      'mang',
      'wifi',
      'camera',
    ],
    suggestionGroups: [
      {
        key: 'issue',
        label: 'Tình trạng thiết bị',
        descriptionPrefix: 'Tình trạng',
        selectionMode: 'single',
        options: [
          'Không lên nguồn / không lên hình',
          'Mất kết nối / tín hiệu chập chờn',
          'Lỗi âm thanh / hiển thị sọc, nhòe',
          'Chạy chậm / lỗi phần mềm / báo lỗi',
          'Cần lắp đặt / cấu hình / bảo dưỡng',
          'Chưa rõ',
        ],
      },
      {
        key: 'device_type',
        label: 'Nhóm thiết bị',
        descriptionPrefix: 'Thiết bị',
        selectionMode: 'single',
        options: [
          'Tivi / Dàn âm thanh',
          'PC / Laptop',
          'Modem WiFi / Hệ thống mạng LAN',
          'Máy in / Thiết bị văn phòng',
          'Chưa rõ',
        ],
      },
      {
        key: 'severity',
        label: 'Mức độ',
        descriptionPrefix: 'Mức độ',
        selectionMode: 'single',
        options: ['Bình thường', 'Cần trong ngày', 'Khẩn cấp (cần cho công việc)', 'Chưa rõ'],
      },
    ],
  },
  {
    code: 'doors_glass_roller',
    sampleId: '10000000-0000-4000-8000-000000000006',
    sampleName: 'Cửa nhôm kính & Cửa cuốn',
    sampleDescription:
      'Thi công, lắp đặt, sửa chữa và vệ sinh cửa nhôm kính, vách ngăn, cửa cuốn',
    keywords: [
      'nhom kinh',
      'cua kinh',
      'vach ngan',
      'cua cuon',
      'cua nhua',
      'kinh cuong luc',
    ],
    suggestionGroups: [
      {
        key: 'issue',
        label: 'Tình trạng / Nhu cầu',
        descriptionPrefix: 'Tình trạng',
        selectionMode: 'single',
        options: [
          'Cửa kẹt / xệ cánh / khó đóng mở',
          'Hỏng bản lề / ray trượt / phụ kiện',
          'Nứt vỡ kính / bung keo chống nước',
          'Lắp đặt mới / thi công vách ngăn',
          'Vệ sinh / bảo dưỡng định kỳ',
          'Chưa rõ',
        ],
      },
      {
        key: 'door_type',
        label: 'Hạng mục',
        descriptionPrefix: 'Hạng mục',
        selectionMode: 'single',
        options: [
          'Cửa nhôm kính (Xingfa / thường)',
          'Cửa kính cường lực / Bản lề sàn',
          'Vách ngăn nhôm kính',
          'Cửa cuốn tự động / kéo tay',
          'Chưa rõ',
        ],
      },
      {
        key: 'severity',
        label: 'Mức độ',
        descriptionPrefix: 'Mức độ',
        selectionMode: 'single',
        options: ['Bình thường', 'Cần trong ngày', 'Khẩn cấp (không đóng/mở được cửa)', 'Chưa rõ'],
      },
    ],
  },
  {
    code: 'metalwork_welding',
    sampleId: '10000000-0000-4000-8000-000000000007',
    sampleName: 'Cơ khí, Sắt & Hàn tiện',
    sampleDescription:
      'Dịch vụ thợ sắt, thợ hàn, thợ tiện, gia công và sửa chữa kết cấu kim loại',
    keywords: [
      'co khi',
      'tho sat',
      'tho han',
      'tho tien',
      'gia cong sat',
      'cua sat',
      'mai ton',
      'lan can',
    ],
    suggestionGroups: [
      {
        key: 'work_type',
        label: 'Nội dung công việc',
        descriptionPrefix: 'Công việc',
        selectionMode: 'single',
        options: [
          'Hàn sửa mối hàn gãy / bung bản lề',
          'Gia cố cửa sắt / cổng sắt / hàng rào',
          'Làm mới khung sắt / mái che / kệ sắt',
          'Gia công / tiện chi tiết cơ khí',
          'Tháo dỡ / cắt sắt theo yêu cầu',
          'Chưa rõ',
        ],
      },
      {
        key: 'material',
        label: 'Vật liệu / Hạng mục',
        descriptionPrefix: 'Vật liệu',
        selectionMode: 'single',
        options: [
          'Sắt hộp / Thép',
          'Inox',
          'Cửa cổng / Lan can / Cầu thang',
          'Mái tôn / Khung giàn',
          'Chưa rõ',
        ],
      },
      {
        key: 'severity',
        label: 'Tiến độ mong muốn',
        descriptionPrefix: 'Tiến độ',
        selectionMode: 'single',
        options: ['Khảo sát & báo giá', 'Làm trong ngày', 'Cần xử lý gấp', 'Chưa rõ'],
      },
    ],
  },
  {
    code: 'locksmith',
    sampleId: '10000000-0000-4000-8000-000000000008',
    sampleName: 'Khóa cửa & An ninh',
    sampleDescription:
      'Sửa khóa, mở khóa, đánh chìa khóa và lắp đặt hệ thống khóa thông minh',
    keywords: [
      'sua khoa',
      'chia khoa',
      'he thong khoa',
      'khoa cua',
      'khoa van tay',
      'khoa dien tu',
    ],
    suggestionGroups: [
      {
        key: 'issue',
        label: 'Tình trạng khóa',
        descriptionPrefix: 'Tình trạng',
        selectionMode: 'single',
        options: [
          'Mất chìa / quên chìa (cần mở khóa)',
          'Kẹt ổ khóa / gãy chìa trong ổ',
          'Làm thêm / đánh lại chìa khóa',
          'Thay ổ khóa mới / nâng cấp khóa',
          'Khóa điện tử / vân tay báo lỗi, hết pin',
          'Chưa rõ',
        ],
      },
      {
        key: 'lock_type',
        label: 'Loại khóa',
        descriptionPrefix: 'Loại khóa',
        selectionMode: 'single',
        options: [
          'Khóa tay nắm tròn / tay gạt',
          'Khóa cửa sắt / cửa cổng / ổ khóa rời',
          'Khóa điện tử / vân tay / thẻ từ',
          'Khóa xe máy / két sắt / tủ',
          'Chưa rõ',
        ],
      },
      {
        key: 'severity',
        label: 'Mức độ',
        descriptionPrefix: 'Mức độ',
        selectionMode: 'single',
        options: ['Bình thường', 'Cần trong ngày', 'Khẩn cấp (đang kẹt bên ngoài)', 'Chưa rõ'],
      },
    ],
  },
  {
    code: 'vehicles',
    sampleId: '10000000-0000-4000-8000-000000000009',
    sampleName: 'Sửa chữa & Chăm sóc Xe',
    sampleDescription:
      'Cứu hộ, sửa chữa xe máy, ô tô, thay vá lốp và đồng sơn ô tô',
    keywords: [
      'sua xe',
      'xe may',
      'xe oto',
      'o to',
      'lop xe',
      'va lop',
      'son o to',
      'cuu ho xe',
    ],
    suggestionGroups: [
      {
        key: 'issue',
        label: 'Tình trạng xe',
        descriptionPrefix: 'Tình trạng',
        selectionMode: 'single',
        options: [
          'Không đề được / chết máy dọc đường',
          'Hết bình ắc quy / cần kích bình',
          'Thủng lốp / xẹp lốp / nổ lốp',
          'Phanh / đèn / còi / điện xe gặp sự cố',
          'Bảo dưỡng / đồng sơn / làm đẹp xe',
          'Chưa rõ',
        ],
      },
      {
        key: 'vehicle_type',
        label: 'Loại phương tiện',
        descriptionPrefix: 'Phương tiện',
        selectionMode: 'single',
        options: [
          'Xe máy số / Xe côn tay',
          'Xe tay ga / Xe máy điện',
          'Ô tô con 4-7 chỗ',
          'Bán tải / Xe tải nhỏ',
          'Chưa rõ',
        ],
      },
      {
        key: 'severity',
        label: 'Vị trí & Mức độ',
        descriptionPrefix: 'Mức độ',
        selectionMode: 'single',
        options: [
          'Xe đang ở nhà / bãi đỗ',
          'Cần hỗ trợ trong ngày',
          'Khẩn cấp (đang nằm đường)',
          'Chưa rõ',
        ],
      },
    ],
  },
  {
    code: 'home_cleaning_painting',
    sampleId: '10000000-0000-4000-8000-000000000010',
    sampleName: 'Vệ sinh & Sơn sửa nhà cửa',
    sampleDescription:
      'Dọn dẹp nhà cửa theo giờ, tổng vệ sinh và sơn sửa nhà, tường trần',
    keywords: [
      'don dep',
      've sinh nha',
      'son nha',
      'son tuong',
      'cai tao nha',
      'nha cua',
    ],
    suggestionGroups: [
      {
        key: 'scope',
        label: 'Hạng mục công việc',
        descriptionPrefix: 'Hạng mục',
        selectionMode: 'single',
        options: [
          'Dọn dẹp nhà cửa định kỳ / theo giờ',
          'Tổng vệ sinh sau xây dựng / chuyển nhà',
          'Sơn dặm vá / sơn lại tường trong nhà',
          'Sơn ngoại thất / xử lý bong tróc, ẩm mốc',
          'Chưa rõ',
        ],
      },
      {
        key: 'area_size',
        label: 'Quy mô / Diện tích',
        descriptionPrefix: 'Quy mô',
        selectionMode: 'single',
        options: [
          '1 phòng / Dưới 40m²',
          'Căn hộ / Nhà 40-80m²',
          'Nhà nguyên căn / Trên 80m²',
          'Chưa rõ',
        ],
      },
      {
        key: 'severity',
        label: 'Thời gian mong muốn',
        descriptionPrefix: 'Thời gian',
        selectionMode: 'single',
        options: ['Theo lịch hẹn', 'Cần trong ngày', 'Cần khảo sát trước', 'Chưa rõ'],
      },
    ],
  },
  {
    code: 'family_care',
    sampleId: '10000000-0000-4000-8000-000000000011',
    sampleName: 'Chăm sóc mẹ và bé & Gia đình',
    sampleDescription:
      'Dịch vụ chăm sóc mẹ bầu, sau sinh, tắm bé và chăm sóc sức khỏe tại nhà',
    keywords: [
      'cham soc me',
      'me va be',
      'me va em be',
      'tam be',
      'sau sinh',
      'cham soc gia dinh',
    ],
    suggestionGroups: [
      {
        key: 'care_package',
        label: 'Nhu cầu chăm sóc',
        descriptionPrefix: 'Nhu cầu',
        selectionMode: 'single',
        options: [
          'Tắm bé & vệ sinh rốn chuẩn y khoa',
          'Chăm sóc phục hồi mẹ sau sinh',
          'Combo chăm sóc toàn diện Mẹ & Bé',
          'Thông tắc tia sữa / Massage bầu',
          'Chưa rõ',
        ],
      },
      {
        key: 'schedule_type',
        label: 'Hình thức buổi hẹn',
        descriptionPrefix: 'Hình thức',
        selectionMode: 'single',
        options: ['Buổi lẻ trải nghiệm', 'Liệu trình theo tuần / tháng', 'Cần tư vấn lộ trình', 'Chưa rõ'],
      },
      {
        key: 'time_slot',
        label: 'Khung giờ ưu tiên',
        descriptionPrefix: 'Khung giờ',
        selectionMode: 'single',
        options: ['Buổi sáng (8h-11h)', 'Buổi chiều (14h-17h)', 'Linh hoạt theo lịch gia đình', 'Chưa rõ'],
      },
    ],
  },
  {
    code: 'moving_porter',
    sampleId: '10000000-0000-4000-8000-000000000012',
    sampleName: 'Bốc xếp & Vận chuyển',
    sampleDescription:
      'Dịch vụ bốc xếp hàng hóa, chuyển nhà, chuyển trọ và vận chuyển đồ đạc',
    keywords: [
      'boc xep',
      'van chuyen',
      'chuyen nha',
      'chuyen tro',
      'khuan vac',
      'hang hoa',
    ],
    suggestionGroups: [
      {
        key: 'cargo_type',
        label: 'Loại đồ đạc / Hàng hóa',
        descriptionPrefix: 'Hàng hóa',
        selectionMode: 'single',
        options: [
          'Đồ gia dụng / Nội thất chuyển nhà',
          'Hàng hóa đóng thùng / Kho xưởng',
          'Đồ nặng (tủ lạnh lớn, máy giặt, két sắt)',
          'Vật liệu xây dựng / Thiết bị văn phòng',
          'Chưa rõ',
        ],
      },
      {
        key: 'terrain',
        label: 'Đặc điểm địa hình',
        descriptionPrefix: 'Địa hình',
        selectionMode: 'single',
        options: [
          'Tầng trệt / Có thang máy',
          'Lầu cao đi thang bộ',
          'Hẻm nhỏ (xe tải không vào tận nơi)',
          'Chưa rõ',
        ],
      },
      {
        key: 'severity',
        label: 'Thời gian thực hiện',
        descriptionPrefix: 'Thời gian',
        selectionMode: 'single',
        options: ['Theo giờ hẹn trước', 'Cần ngay trong ngày', 'Ngoài giờ hành chính / Đêm', 'Chưa rõ'],
      },
    ],
  },
];

/**
 * 16 Service-specific overrides for services that need specialized options
 * distinct from their parent Category default.
 */
export const SERVICE_SUGGESTION_OVERRIDES: ServicePresetDefinition[] = [
  // 1. Vệ sinh máy lạnh
  {
    code: 'ac_cleaning',
    serviceIds: ['a26e3c78-f202-4ec0-a2f9-2462371d05a4'],
    keywords: ['ve sinh may lanh', 'bao duong may lanh', 'rua may lanh', 'bao duong ac'],
    suggestionGroups: [
      {
        key: 'issue',
        label: 'Nhu cầu & Tình trạng',
        descriptionPrefix: 'Nhu cầu',
        selectionMode: 'single',
        options: [
          'Vệ sinh định kỳ (máy vẫn lạnh)',
          'Bụi bẩn nhiều / hơi lạnh yếu',
          'Máy chảy nước khi đang chạy',
          'Có mùi hôi / ẩm mốc khi bật máy',
          'Kiểm tra và châm thêm gas',
          'Chưa rõ',
        ],
      },
      {
        key: 'quantity',
        label: 'Số lượng & Loại máy',
        descriptionPrefix: 'Số lượng',
        selectionMode: 'single',
        options: [
          '1 máy treo tường',
          '2-3 máy treo tường',
          'Từ 4 máy trở lên',
          'Máy âm trần / tủ đứng',
          'Chưa rõ',
        ],
      },
      {
        key: 'severity',
        label: 'Thời gian mong muốn',
        descriptionPrefix: 'Thời gian',
        selectionMode: 'single',
        options: ['Linh hoạt theo lịch hẹn', 'Cần trong ngày', 'Cuối tuần / Ngoài giờ', 'Chưa rõ'],
      },
    ],
  },
  // 2. Sửa máy lạnh
  {
    code: 'ac_repair',
    serviceIds: ['34ec7df5-20db-401e-804a-6feee5b48184'],
    keywords: ['sua may lanh', 'sua dieu hoa'],
    suggestionGroups: [
      {
        key: 'issue',
        label: 'Tình trạng thiết bị',
        descriptionPrefix: 'Tình trạng',
        selectionMode: 'single',
        options: [
          'Không lạnh / yếu lạnh',
          'Chảy nước dàn lạnh',
          'Kêu to / rung mạnh',
          'Không lên nguồn / chớp đèn báo lỗi',
          'Dàn nóng không chạy / tự ngắt liên tục',
          'Chưa rõ',
        ],
      },
      {
        key: 'device_type',
        label: 'Loại máy',
        descriptionPrefix: 'Loại máy',
        selectionMode: 'single',
        options: ['Treo tường', 'Âm trần', 'Tủ đứng', 'Hệ thống Multi / VRV', 'Chưa rõ'],
      },
      {
        key: 'severity',
        label: 'Mức độ',
        descriptionPrefix: 'Mức độ',
        selectionMode: 'single',
        options: ['Bình thường', 'Cần trong ngày', 'Khẩn cấp', 'Chưa rõ'],
      },
    ],
  },
  // 3. Tháo và lắp đặt máy lạnh
  {
    code: 'ac_install',
    serviceIds: ['6198feb0-dd81-4647-b12b-6afce3492bb7'],
    keywords: ['thao va lap dat may lanh', 'lap dat may lanh', 'di doi may lanh'],
    suggestionGroups: [
      {
        key: 'work_type',
        label: 'Nhu cầu lắp đặt',
        descriptionPrefix: 'Nhu cầu',
        selectionMode: 'single',
        options: [
          'Lắp đặt máy lạnh mới',
          'Tháo máy lạnh cũ',
          'Tháo và di dời sang vị trí mới',
          'Đi âm ống đồng / vật tư chờ sẵn',
          'Chưa rõ',
        ],
      },
      {
        key: 'install_position',
        label: 'Vị trí dàn nóng / địa hình',
        descriptionPrefix: 'Vị trí lắp',
        selectionMode: 'single',
        options: [
          'Ban công / Lô gia thuận tiện',
          'Treo tường ngoài cao (cần thang dây)',
          'Có sẵn ống đồng & dây điện chờ',
          'Chưa có vật tư ống đồng',
          'Chưa rõ',
        ],
      },
      {
        key: 'severity',
        label: 'Thời gian mong muốn',
        descriptionPrefix: 'Thời gian',
        selectionMode: 'single',
        options: ['Theo lịch hẹn', 'Cần lắp trong ngày', 'Khẩn cấp', 'Chưa rõ'],
      },
    ],
  },
  // 4. Sửa tủ lạnh
  {
    code: 'fridge_repair',
    serviceIds: ['4607a579-8fb0-4261-9be4-679b97e96a95'],
    keywords: ['sua tu lanh', 'sua tu dong', 'sua tu mat'],
    suggestionGroups: [
      {
        key: 'issue',
        label: 'Sự cố tủ lạnh',
        descriptionPrefix: 'Sự cố',
        selectionMode: 'single',
        options: [
          'Ngăn đá không đông / ngăn mát không lạnh',
          'Đóng tuyết dày / chảy nước ra sàn',
          'Tủ mất nguồn / đèn không sáng',
          'Block kêu to / tủ nóng bất thường',
          'Cửa tủ hở gioăng / đóng không khít',
          'Chưa rõ',
        ],
      },
      {
        key: 'fridge_type',
        label: 'Loại tủ lạnh',
        descriptionPrefix: 'Loại tủ',
        selectionMode: 'single',
        options: [
          'Tủ lạnh 2 cánh thông thường',
          'Tủ lạnh Inverter / Side-by-Side',
          'Tủ đông / Tủ mát trưng bày',
          'Tủ lạnh mini',
          'Chưa rõ',
        ],
      },
      {
        key: 'severity',
        label: 'Mức độ',
        descriptionPrefix: 'Mức độ',
        selectionMode: 'single',
        options: ['Bình thường', 'Cần trong ngày', 'Khẩn cấp (nhiều thực phẩm cần bảo quản)', 'Chưa rõ'],
      },
    ],
  },
  // 5. Vệ sinh tủ lạnh
  {
    code: 'fridge_cleaning',
    serviceIds: ['a02d5013-a2d0-437e-8195-d1591352e23c'],
    keywords: ['ve sinh tu lanh'],
    suggestionGroups: [
      {
        key: 'issue',
        label: 'Tình trạng tủ',
        descriptionPrefix: 'Tình trạng',
        selectionMode: 'single',
        options: [
          'Vệ sinh khử mùi & diệt khuẩn định kỳ',
          'Tủ có mùi hôi thực phẩm lâu ngày',
          'Đóng tuyết / bám bẩn khay kệ & gioăng cửa',
          'Tủ để lâu không dùng cần tổng vệ sinh',
          'Chưa rõ',
        ],
      },
      {
        key: 'fridge_type',
        label: 'Loại tủ lạnh',
        descriptionPrefix: 'Loại tủ',
        selectionMode: 'single',
        options: [
          'Tủ lạnh 2 cánh dưới 300L',
          'Tủ lớn trên 300L / Side-by-Side',
          'Tủ đông / Tủ mát quán ăn',
          'Chưa rõ',
        ],
      },
      {
        key: 'severity',
        label: 'Thời gian mong muốn',
        descriptionPrefix: 'Thời gian',
        selectionMode: 'single',
        options: ['Theo lịch hẹn', 'Cần trong ngày', 'Cuối tuần', 'Chưa rõ'],
      },
    ],
  },
  // 6. Thông cống
  {
    code: 'drain_unclog',
    serviceIds: ['0ae3c4ef-005f-43c2-a995-c36d0a85da1c'],
    keywords: ['thong cong', 'thong tac', 'nghet cong'],
    suggestionGroups: [
      {
        key: 'issue',
        label: 'Tình trạng tắc nghẽn',
        descriptionPrefix: 'Tình trạng',
        selectionMode: 'single',
        options: [
          'Nước rút rất chậm',
          'Tắc hoàn toàn / trào ngược nước',
          'Bốc mùi hôi nồng nặc từ cống',
          'Rơi dị vật / đóng mỡ lâu ngày',
          'Chưa rõ',
        ],
      },
      {
        key: 'location',
        label: 'Vị trí cần thông',
        descriptionPrefix: 'Vị trí',
        selectionMode: 'single',
        options: [
          'Bồn rửa chén (nhà bếp)',
          'Phễu thoát sàn nhà tắm / WC',
          'Bồn cầu / Lavabo',
          'Đường cống chính / Hố ga sân vườn',
          'Chưa rõ',
        ],
      },
      {
        key: 'severity',
        label: 'Mức độ',
        descriptionPrefix: 'Mức độ',
        selectionMode: 'single',
        options: ['Nhẹ (thoát chậm)', 'Trung bình', 'Khẩn cấp (ngập / trào nước)', 'Chưa rõ'],
      },
    ],
  },
  // 7. Lắp đặt và sửa chữa bồn cầu
  {
    code: 'toilet_repair',
    serviceIds: ['bafb30bd-7908-42b8-bb31-b2d6c2132700'],
    keywords: ['bon cau', 'toilet'],
    suggestionGroups: [
      {
        key: 'issue',
        label: 'Sự cố bồn cầu',
        descriptionPrefix: 'Sự cố',
        selectionMode: 'single',
        options: [
          'Tắc nghẽn / xả nước không trôi',
          'Rỉ nước liên tục / hỏng bộ xả & phao',
          'Hỏng vòi xịt / dây cấp nước',
          'Rò nước chân đế / bốc mùi hôi',
          'Thay mới / lắp đặt bồn cầu',
          'Chưa rõ',
        ],
      },
      {
        key: 'toilet_type',
        label: 'Loại thiết bị',
        descriptionPrefix: 'Thiết bị',
        selectionMode: 'single',
        options: [
          'Bồn cầu 1 khối / 2 khối thông thường',
          'Bồn cầu treo tường / két nước âm',
          'Nắp rửa điện tử / thông minh',
          'Chưa rõ',
        ],
      },
      {
        key: 'severity',
        label: 'Mức độ',
        descriptionPrefix: 'Mức độ',
        selectionMode: 'single',
        options: ['Bình thường', 'Cần trong ngày', 'Khẩn cấp (nhà chỉ có 1 WC)', 'Chưa rõ'],
      },
    ],
  },
  // 8. Sửa máy giặt
  {
    code: 'washing_machine_repair',
    serviceIds: ['cbb1b85c-32f9-4041-a0fd-df5cde04784f'],
    keywords: ['sua may giat'],
    suggestionGroups: [
      {
        key: 'issue',
        label: 'Sự cố máy giặt',
        descriptionPrefix: 'Sự cố',
        selectionMode: 'single',
        options: [
          'Không cấp nước / không xả nước',
          'Không vắt / lồng giặt không quay',
          'Kêu to / rung lắc mạnh khi vắt',
          'Không lên nguồn / báo mã lỗi màn hình',
          'Kẹt cửa / rò rỉ nước dưới gầm',
          'Chưa rõ',
        ],
      },
      {
        key: 'machine_type',
        label: 'Loại máy giặt',
        descriptionPrefix: 'Loại máy',
        selectionMode: 'single',
        options: [
          'Máy giặt cửa trước (lồng ngang)',
          'Máy giặt cửa trên (lồng đứng)',
          'Máy giặt sấy kết hợp / Máy sấy riêng',
          'Chưa rõ',
        ],
      },
      {
        key: 'severity',
        label: 'Mức độ',
        descriptionPrefix: 'Mức độ',
        selectionMode: 'single',
        options: ['Bình thường', 'Cần trong ngày', 'Khẩn cấp (đang kẹt đồ và nước trong máy)', 'Chưa rõ'],
      },
    ],
  },
  // 9. Vệ sinh máy giặt
  {
    code: 'washing_machine_cleaning',
    serviceIds: ['82ec4aaa-48ed-4711-a318-7a5e9cd3ab8a'],
    keywords: ['ve sinh may giat', 'bao duong may giat'],
    suggestionGroups: [
      {
        key: 'issue',
        label: 'Tình trạng & Nhu cầu',
        descriptionPrefix: 'Tình trạng',
        selectionMode: 'single',
        options: [
          'Tháo lồng vệ sinh chuyên sâu định kỳ',
          'Quần áo giặt xong vẫn dính cặn bẩn',
          'Lồng giặt có mùi hôi / nấm mốc gioăng cao su',
          'Nước cấp vào yếu (tắc lưới lọc van cấp)',
          'Chưa rõ',
        ],
      },
      {
        key: 'machine_type',
        label: 'Loại máy giặt',
        descriptionPrefix: 'Loại máy',
        selectionMode: 'single',
        options: [
          'Máy giặt cửa trên (lồng đứng)',
          'Máy giặt cửa trước (lồng ngang)',
          'Máy giặt sấy kết hợp',
          'Chưa rõ',
        ],
      },
      {
        key: 'severity',
        label: 'Thời gian mong muốn',
        descriptionPrefix: 'Thời gian',
        selectionMode: 'single',
        options: ['Theo lịch hẹn', 'Cần trong ngày', 'Cuối tuần', 'Chưa rõ'],
      },
    ],
  },
  // 10. Sửa máy tính
  {
    code: 'computer_repair',
    serviceIds: ['26801324-11d6-4a96-8d1c-da1125451e21'],
    keywords: ['sua may tinh', 'sua laptop', 'cai win', 'sua pc'],
    suggestionGroups: [
      {
        key: 'issue',
        label: 'Sự cố máy tính',
        descriptionPrefix: 'Sự cố',
        selectionMode: 'single',
        options: [
          'Không lên nguồn / bật không lên màn hình',
          'Máy chạy chậm / treo đơ / màn hình xanh',
          'Cài lại Windows / phần mềm văn phòng, đồ họa',
          'Vệ sinh máy, tra keo tản nhiệt / máy quá nóng',
          'Nâng cấp SSD / RAM / thay linh kiện',
          'Chưa rõ',
        ],
      },
      {
        key: 'device_type',
        label: 'Loại máy',
        descriptionPrefix: 'Thiết bị',
        selectionMode: 'single',
        options: ['Laptop Windows', 'Máy tính để bàn (PC)', 'MacBook / iMac', 'Chưa rõ'],
      },
      {
        key: 'severity',
        label: 'Mức độ',
        descriptionPrefix: 'Mức độ',
        selectionMode: 'single',
        options: ['Bình thường', 'Cần trong ngày', 'Khẩn cấp (đang cần làm việc gấp)', 'Chưa rõ'],
      },
    ],
  },
  // 11. Lắp đặt và sửa chữa mạng / Bảo dưỡng máy in
  {
    code: 'network_printer',
    serviceIds: [
      '6b262019-0b59-44b2-9ca1-e57d8a157641',
      '9a2432cf-7170-404b-89ee-c67589dc3581',
    ],
    keywords: ['sua chua mang', 'lap dat mang', 'bao duong may in', 'sua may in', 'wifi'],
    suggestionGroups: [
      {
        key: 'issue',
        label: 'Sự cố mạng / máy in',
        descriptionPrefix: 'Sự cố',
        selectionMode: 'single',
        options: [
          'Mất kết nối Internet / WiFi chập chờn',
          'Đi dây mạng LAN / bấm đầu dây / lắp bộ phát WiFi',
          'Máy in kẹt giấy / bản in mờ, sọc đen',
          'Nạp mực máy in / không kết nối được máy in',
          'Chưa rõ',
        ],
      },
      {
        key: 'location',
        label: 'Khu vực sử dụng',
        descriptionPrefix: 'Khu vực',
        selectionMode: 'single',
        options: ['Nhà riêng / Căn hộ', 'Văn phòng công ty', 'Cửa hàng / Quán kinh doanh', 'Chưa rõ'],
      },
      {
        key: 'severity',
        label: 'Mức độ',
        descriptionPrefix: 'Mức độ',
        selectionMode: 'single',
        options: ['Bình thường', 'Cần trong ngày', 'Khẩn cấp (gián đoạn công việc)', 'Chưa rõ'],
      },
    ],
  },
  // 12. Lắp đặt / Bảo trì và sửa chữa cửa cuốn
  {
    code: 'roller_door',
    serviceIds: [
      'fe146375-2e57-460e-b470-d745678fc96d',
      '8b11f4d5-f5bc-41df-880b-adcf93cf54f4',
    ],
    keywords: ['cua cuon'],
    suggestionGroups: [
      {
        key: 'issue',
        label: 'Tình trạng cửa cuốn',
        descriptionPrefix: 'Tình trạng',
        selectionMode: 'single',
        options: [
          'Cửa không lên/xuống được (kẹt nan / lệch hành trình)',
          'Remote bấm không nhận / hỏng hộp điều khiển',
          'Motor cửa cuốn yếu / kêu to / không chạy',
          'Bình lưu điện (UPS) hỏng khi mất điện',
          'Lắp đặt mới / bảo dưỡng cửa cuốn định kỳ',
          'Chưa rõ',
        ],
      },
      {
        key: 'door_type',
        label: 'Loại cửa cuốn',
        descriptionPrefix: 'Loại cửa',
        selectionMode: 'single',
        options: [
          'Cửa cuốn khe thoáng / nan nhôm tự động',
          'Cửa cuốn tấm liền',
          'Cửa cuốn kéo tay (lò xo)',
          'Chưa rõ',
        ],
      },
      {
        key: 'severity',
        label: 'Mức độ',
        descriptionPrefix: 'Mức độ',
        selectionMode: 'single',
        options: ['Bình thường', 'Cần trong ngày', 'Khẩn cấp (kẹt cửa không ra/vào được)', 'Chưa rõ'],
      },
    ],
  },
  // 13. Thay và vá lốp xe
  {
    code: 'tire_service',
    serviceIds: ['7e847933-e733-409c-b0c1-3d4972f44f22'],
    keywords: ['thay va va lop xe', 'va lop', 'thay lop'],
    suggestionGroups: [
      {
        key: 'issue',
        label: 'Tình trạng lốp xe',
        descriptionPrefix: 'Tình trạng',
        selectionMode: 'single',
        options: [
          'Cán đinh / xẹp lốp cần vá lưu động',
          'Rách lốp / nổ lốp cần thay mới',
          'Thay lốp dự phòng (sơ cua) tại chỗ',
          'Bơm lốp & kiểm tra van rò hơi',
          'Chưa rõ',
        ],
      },
      {
        key: 'vehicle_type',
        label: 'Loại xe',
        descriptionPrefix: 'Loại xe',
        selectionMode: 'single',
        options: [
          'Xe máy (lốp không săm / có săm)',
          'Ô tô 4-7 chỗ',
          'Xe bán tải / Xe tải nhỏ',
          'Chưa rõ',
        ],
      },
      {
        key: 'severity',
        label: 'Vị trí hiện tại',
        descriptionPrefix: 'Vị trí',
        selectionMode: 'single',
        options: ['Đang đỗ tại nhà / hầm xe', 'Đang dừng bên đường (cần cứu hộ gấp)', 'Chưa rõ'],
      },
    ],
  },
  // 14. Sửa xe oto / Sơn ô tô
  {
    code: 'car_paint_repair',
    serviceIds: [
      '253e55aa-f41f-4a2f-8b17-768b9166865a',
      '20b7445c-96fc-4180-bae9-9d336924b72c',
    ],
    keywords: ['sua xe oto', 'sua o to', 'son o to', 'dong son'],
    suggestionGroups: [
      {
        key: 'issue',
        label: 'Tình trạng / Nhu cầu',
        descriptionPrefix: 'Tình trạng',
        selectionMode: 'single',
        options: [
          'Hết bình ắc quy / không đề nổ được',
          'Báo đèn lỗi động cơ / hệ thống điện, điều hòa',
          'Trầy xước / móp méo cần đồng sơn dặm vá',
          'Đánh bóng / sơn quây toàn xe',
          'Bảo dưỡng định kỳ / kiểm tra tổng quát',
          'Chưa rõ',
        ],
      },
      {
        key: 'car_type',
        label: 'Dòng xe',
        descriptionPrefix: 'Dòng xe',
        selectionMode: 'single',
        options: ['Sedan / Hatchback 4-5 chỗ', 'SUV / MPV 7 chỗ', 'Bán tải (Pickup)', 'Chưa rõ'],
      },
      {
        key: 'severity',
        label: 'Mức độ',
        descriptionPrefix: 'Mức độ',
        selectionMode: 'single',
        options: ['Đặt lịch hẹn / Báo giá', 'Cần hỗ trợ trong ngày', 'Khẩn cấp (cứu hộ tận nơi)', 'Chưa rõ'],
      },
    ],
  },
  // 15. Dọn dẹp nhà cửa
  {
    code: 'house_cleaning',
    serviceIds: ['4c441301-efeb-43d1-ae58-a51a4eb90997'],
    keywords: ['don dep nha cua', 've sinh nha cua', 'giup viec theo gio'],
    suggestionGroups: [
      {
        key: 'cleaning_package',
        label: 'Gói dọn dẹp',
        descriptionPrefix: 'Gói dịch vụ',
        selectionMode: 'single',
        options: [
          'Dọn dẹp theo giờ (lau dọn cơ bản)',
          'Tổng vệ sinh toàn bộ nhà / căn hộ',
          'Vệ sinh nhà mới xây / mới sửa xong',
          'Dọn nhà đón Tết / trước khi chuyển vào ở',
          'Chưa rõ',
        ],
      },
      {
        key: 'property_type',
        label: 'Loại hình & Diện tích',
        descriptionPrefix: 'Không gian',
        selectionMode: 'single',
        options: [
          'Căn hộ chung cư 1-2 phòng ngủ',
          'Căn hộ 3 phòng ngủ / Nhà phố 1-2 tầng',
          'Nhà nguyên căn từ 3 tầng trở lên',
          'Văn phòng / Mặt bằng kinh doanh',
          'Chưa rõ',
        ],
      },
      {
        key: 'tools_note',
        label: 'Dụng cụ & Hóa chất',
        descriptionPrefix: 'Dụng cụ',
        selectionMode: 'single',
        options: [
          'Nhà đã có sẵn dụng cụ cơ bản',
          'Cần nhân viên mang đầy đủ dụng cụ & hóa chất',
          'Chưa rõ',
        ],
      },
    ],
  },
  // 16. Sơn nhà
  {
    code: 'house_painting',
    serviceIds: ['3c049147-4803-40e6-9ebb-37a313fad5e9'],
    keywords: ['son nha', 'son tuong'],
    excludeKeywords: ['o to', 'oto', 'xe'],
    suggestionGroups: [
      {
        key: 'paint_scope',
        label: 'Hạng mục cần sơn',
        descriptionPrefix: 'Hạng mục',
        selectionMode: 'single',
        options: [
          'Sơn dặm vá / sơn lại 1-2 phòng',
          'Sơn mới toàn bộ nội thất trong nhà',
          'Sơn mặt tiền / ngoại thất chống thấm',
          'Xử lý tường bong tróc, ẩm mốc rồi sơn lại',
          'Chưa rõ',
        ],
      },
      {
        key: 'material_option',
        label: 'Vật tư sơn',
        descriptionPrefix: 'Vật tư',
        selectionMode: 'single',
        options: [
          'Khoán trọn gói (cả nhân công + vật tư sơn)',
          'Chủ nhà đã có sơn, chỉ thuê nhân công',
          'Cần thợ khảo sát & tư vấn loại sơn',
          'Chưa rõ',
        ],
      },
      {
        key: 'severity',
        label: 'Tiến độ mong muốn',
        descriptionPrefix: 'Tiến độ',
        selectionMode: 'single',
        options: ['Khảo sát & báo giá trước', 'Thi công trong tuần này', 'Cần làm gấp', 'Chưa rõ'],
      },
    ],
  },
];

/**
 * Sample catalog seed covering all 38 UUIDs in `mobile/src/constants/services.ts`
 * plus family care & moving/porter services for local verification (`--seed-sample-catalog`).
 */
export const SAMPLE_CATALOG_SERVICES: SampleCatalogServiceSeed[] = [
  // Điện lạnh
  {
    id: 'a26e3c78-f202-4ec0-a2f9-2462371d05a4',
    name: 'Vệ sinh máy lạnh',
    categoryCode: 'ac_cooling',
    description: 'Vệ sinh, xịt rửa dàn nóng/lạnh và kiểm tra gas máy lạnh tại nhà',
  },
  {
    id: '34ec7df5-20db-401e-804a-6feee5b48184',
    name: 'Sửa máy lạnh',
    categoryCode: 'ac_cooling',
    description: 'Kiểm tra và khắc phục sự cố máy lạnh không lạnh, chảy nước, báo lỗi',
  },
  {
    id: '4607a579-8fb0-4261-9be4-679b97e96a95',
    name: 'Sửa tủ lạnh',
    categoryCode: 'ac_cooling',
    description: 'Sửa chữa tủ lạnh, tủ đông, tủ mát các hãng tại nhà',
  },
  {
    id: '6198feb0-dd81-4647-b12b-6afce3492bb7',
    name: 'Tháo và lắp đặt máy lạnh',
    categoryCode: 'ac_cooling',
    description: 'Tháo dỡ, di dời và lắp đặt máy lạnh đúng kỹ thuật',
  },
  {
    id: 'a02d5013-a2d0-437e-8195-d1591352e23c',
    name: 'Vệ sinh tủ lạnh',
    categoryCode: 'ac_cooling',
    description: 'Vệ sinh, khử mùi và bảo dưỡng tủ lạnh tại nhà',
  },
  // Điện dân dụng
  {
    id: 'a34626a6-fbe8-44fe-9ceb-33e85285b0e8',
    name: 'Sửa điện',
    categoryCode: 'electricity',
    description: 'Xử lý sự cố mất điện, chập điện, nhảy CB, hỏng ổ cắm công tắc',
  },
  {
    id: '2e5e21b9-6768-4ff3-904f-51d5766d6f74',
    name: 'Lắp đặt hệ thống điện',
    categoryCode: 'electricity',
    description: 'Thi công, đi dây và lắp đặt hệ thống điện dân dụng',
  },
  {
    id: '8dd10a77-0cc0-4b04-8854-30b0a40e5ccb',
    name: 'Hệ thống chiếu sáng',
    categoryCode: 'electricity',
    description: 'Lắp đặt và sửa chữa đèn LED, đèn trang trí, hệ thống chiếu sáng',
  },
  // Ống nước & Thoát nước
  {
    id: 'b1026b8e-dd6c-478b-aeab-1afb582bcfd0',
    name: 'Sửa ống nước',
    categoryCode: 'plumbing',
    description: 'Sửa rò rỉ, vỡ đường ống nước, thay vòi nước và van khóa',
  },
  {
    id: '0ae3c4ef-005f-43c2-a995-c36d0a85da1c',
    name: 'Thông cống',
    categoryCode: 'plumbing',
    description: 'Thông tắc cống thoát nước, bồn rửa chén, thoát sàn nhà tắm',
  },
  {
    id: '27bf0049-8059-4661-9450-5de5c09e924e',
    name: 'Bảo trì hệ thống nước',
    categoryCode: 'plumbing',
    description: 'Kiểm tra, vệ sinh bồn nước và bảo trì hệ thống cấp thoát nước',
  },
  {
    id: 'bafb30bd-7908-42b8-bb31-b2d6c2132700',
    name: 'Lắp đặt và sửa chữa bồn cầu',
    categoryCode: 'plumbing',
    description: 'Thông tắc, sửa bộ xả và lắp đặt bồn cầu, thiết bị nhà vệ sinh',
  },
  // Điện gia dụng
  {
    id: 'cbb1b85c-32f9-4041-a0fd-df5cde04784f',
    name: 'Sửa máy giặt',
    categoryCode: 'appliances',
    description: 'Sửa máy giặt cửa ngang, cửa trên không vắt, không xả, báo lỗi',
  },
  {
    id: '82ec4aaa-48ed-4711-a318-7a5e9cd3ab8a',
    name: 'Vệ sinh máy giặt',
    categoryCode: 'appliances',
    description: 'Tháo lồng vệ sinh máy giặt sạch cặn bẩn và nấm mốc',
  },
  {
    id: 'b676caef-62e8-475c-afa1-35b772bb4ffe',
    name: 'Sửa điện gia dụng khác',
    categoryCode: 'appliances',
    description: 'Sửa bình nóng lạnh, lò vi sóng, bếp từ, quạt điện, máy lọc nước',
  },
  // Điện tử, Máy tính & Mạng
  {
    id: '2f77c5e1-f653-4de8-b0b7-8ce969394d2e',
    name: 'Sửa tivi',
    categoryCode: 'electronics_it',
    description: 'Sửa tivi mất nguồn, sọc màn hình, mất tiếng tại nhà',
  },
  {
    id: '564e6916-2937-440b-90dc-9219d98a7823',
    name: 'Điện tử gia dụng',
    categoryCode: 'electronics_it',
    description: 'Sửa chữa các thiết bị điện tử dân dụng trong gia đình',
  },
  {
    id: '9a2432cf-7170-404b-89ee-c67589dc3581',
    name: 'Bảo dưỡng máy in',
    categoryCode: 'electronics_it',
    description: 'Nạp mực, sửa kẹt giấy và bảo dưỡng máy in văn phòng, gia đình',
  },
  {
    id: '6b262019-0b59-44b2-9ca1-e57d8a157641',
    name: 'Lắp đặt và sửa chữa mạng',
    categoryCode: 'electronics_it',
    description: 'Đi dây mạng LAN, cấu hình Modem/Router WiFi và khắc phục sự cố mạng',
  },
  {
    id: '7064eadb-3972-44a9-9f8a-bd12e5abab51',
    name: 'Sửa tivi và âm thanh',
    categoryCode: 'electronics_it',
    description: 'Sửa chữa tivi, loa, amply và hệ thống âm thanh gia đình',
  },
  {
    id: '26801324-11d6-4a96-8d1c-da1125451e21',
    name: 'Sửa máy tính',
    categoryCode: 'electronics_it',
    description: 'Sửa chữa PC, Laptop, cài đặt phần mềm và nâng cấp linh kiện',
  },
  // Cửa nhôm kính & Cửa cuốn
  {
    id: '795ff33f-38cd-4ba6-9a96-56dbf0fc8401',
    name: 'Cửa nhôm kính',
    categoryCode: 'doors_glass_roller',
    description: 'Sửa chữa và thi công cửa nhôm kính, chỉnh xệ cánh, thay phụ kiện',
  },
  {
    id: '216c282e-1f9c-4e05-9fe8-4a67296e92b5',
    name: 'Lắp đặt cửa kính',
    categoryCode: 'doors_glass_roller',
    description: 'Lắp đặt cửa kính cường lực, bản lề sàn, cửa lùa kính',
  },
  {
    id: '6bf3ebba-b0da-4676-86a7-b2bce3f7e375',
    name: 'Thi công vách ngăn nhôm',
    categoryCode: 'doors_glass_roller',
    description: 'Đóng vách ngăn nhôm kính cho phòng ngủ, văn phòng, cửa hàng',
  },
  {
    id: '1599bb92-c0c4-4649-82d5-186649bcc534',
    name: 'Vệ sinh cửa kính',
    categoryCode: 'doors_glass_roller',
    description: 'Lau chùi, vệ sinh cửa kính, vách kính nhà ở và cửa hàng',
  },
  {
    id: 'fe146375-2e57-460e-b470-d745678fc96d',
    name: 'Lắp đặt cửa cuốn',
    categoryCode: 'doors_glass_roller',
    description: 'Tư vấn và lắp đặt cửa cuốn tự động, cửa cuốn kéo tay',
  },
  {
    id: '8b11f4d5-f5bc-41df-880b-adcf93cf54f4',
    name: 'Bảo trì và sửa chữa cửa cuốn',
    categoryCode: 'doors_glass_roller',
    description: 'Cứu hộ cửa cuốn kẹt nan, sửa motor, bộ điều khiển và bình lưu điện',
  },
  // Cơ khí, Sắt & Hàn tiện
  {
    id: 'c8cb7fd1-56f4-42e5-a4c6-be30b4235fcd',
    name: 'Thợ sắt',
    categoryCode: 'metalwork_welding',
    description: 'Gia công, lắp đặt và sửa chữa cửa sắt, hàng rào, khung bảo vệ, mái tôn',
  },
  {
    id: 'c5e4bb59-716a-4951-82b3-93a1f3ea094d',
    name: 'Thợ hàn',
    categoryCode: 'metalwork_welding',
    description: 'Hàn sắt, inox tại nhà: hàn bản lề cửa, cầu thang, kệ sắt, khung giàn',
  },
  {
    id: '38b95d0a-8b1b-415f-a194-12b0d32e3516',
    name: 'Thợ tiện',
    categoryCode: 'metalwork_welding',
    description: 'Gia công tiện, phay, chế tạo và phục hồi chi tiết cơ khí',
  },
  // Khóa cửa & An ninh
  {
    id: 'e8da7d52-efc6-41dc-af48-e58fe9d22a62',
    name: 'Sửa khoá và làm chìa khoá',
    categoryCode: 'locksmith',
    description: 'Mở khóa, sửa ổ khóa kẹt, đánh chìa khóa nhà, xe máy, két sắt',
  },
  {
    id: 'bce31380-4e68-4251-9646-871830532ec1',
    name: 'Lắp đặt hệ thống khoá',
    categoryCode: 'locksmith',
    description: 'Lắp đặt ổ khóa cơ, khóa vân tay, khóa thẻ từ thông minh',
  },
  // Sửa chữa & Chăm sóc Xe
  {
    id: '5bbb2caa-0f6a-4f7a-b48b-a7d5c91f2ce3',
    name: 'Sửa xe máy',
    categoryCode: 'vehicles',
    description: 'Cứu hộ và sửa chữa xe máy tận nơi: chết máy, hết bình, thay phụ tùng',
  },
  {
    id: '253e55aa-f41f-4a2f-8b17-768b9166865a',
    name: 'Sửa xe oto',
    categoryCode: 'vehicles',
    description: 'Cứu hộ kích bình, kiểm tra và sửa chữa ô tô lưu động / tại xưởng',
  },
  {
    id: '20b7445c-96fc-4180-bae9-9d336924b72c',
    name: 'Sơn ô tô',
    categoryCode: 'vehicles',
    description: 'Đồng sơn xóa trầy xước, sơn dặm vá và đánh bóng ô tô',
  },
  {
    id: '7e847933-e733-409c-b0c1-3d4972f44f22',
    name: 'Thay và vá lốp xe',
    categoryCode: 'vehicles',
    description: 'Vá lốp lưu động, thay lốp sơ cua và cứu hộ lốp xe máy, ô tô',
  },
  // Vệ sinh & Sơn sửa nhà cửa
  {
    id: '4c441301-efeb-43d1-ae58-a51a4eb90997',
    name: 'Dọn dẹp nhà cửa',
    categoryCode: 'home_cleaning_painting',
    description: 'Dọn dẹp nhà cửa theo giờ, tổng vệ sinh căn hộ và nhà phố',
  },
  {
    id: '3c049147-4803-40e6-9ebb-37a313fad5e9',
    name: 'Sơn nhà',
    categoryCode: 'home_cleaning_painting',
    description: 'Sơn mới, sơn lại tường trong nhà, mặt tiền và xử lý bong tróc',
  },
  // Chăm sóc mẹ và bé & Gia đình
  {
    id: '50000000-0000-4000-8000-000000000039',
    name: 'Chăm sóc mẹ và em bé',
    categoryCode: 'family_care',
    description: 'Tắm bé chuẩn y khoa và chăm sóc phục hồi mẹ sau sinh tại nhà',
  },
  // Bốc xếp & Vận chuyển
  {
    id: '50000000-0000-4000-8000-000000000040',
    name: 'Bốc xếp hàng hoá',
    categoryCode: 'moving_porter',
    description: 'Bốc xếp hàng hóa, khuân vác đồ đạc và hỗ trợ chuyển nhà, kho xưởng',
  },
];

/**
 * Matches a category row (by name / description) to the best Category preset,
 * falling back to `DEFAULT_FALLBACK_SUGGESTION_GROUPS` when no domain keyword matches.
 */
export function matchCategoryPreset(input: {
  name: string;
  description?: string | null;
}): { code: string; suggestionGroups: ServiceSuggestionGroup[] } {
  const normalizedName = normalizeViText(input.name);
  const normalizedDesc = normalizeViText(input.description);

  // 1. Check name first for highest specificity
  for (const preset of CATEGORY_SUGGESTION_PRESETS) {
    if (preset.keywords.some((kw) => normalizedName.includes(kw))) {
      return { code: preset.code, suggestionGroups: preset.suggestionGroups };
    }
  }

  // 2. Check combined name + description
  const combined = `${normalizedName} ${normalizedDesc}`.trim();
  for (const preset of CATEGORY_SUGGESTION_PRESETS) {
    if (preset.keywords.some((kw) => combined.includes(kw))) {
      return { code: preset.code, suggestionGroups: preset.suggestionGroups };
    }
  }

  return {
    code: 'fallback',
    suggestionGroups: DEFAULT_FALLBACK_SUGGESTION_GROUPS,
  };
}

/**
 * Matches a service row (by UUID or name) to a Service-specific override if applicable.
 * Services without a specialized override return `null` so they inherit from their parent Category
 * (or can fall back to their matched category preset if desired).
 */
export function matchServiceOverridePreset(input: {
  id?: string | null;
  name: string;
}): { code: string; suggestionGroups: ServiceSuggestionGroup[] } | null {
  const normalizedId = input.id?.trim().toLowerCase();
  if (normalizedId) {
    for (const preset of SERVICE_SUGGESTION_OVERRIDES) {
      if (preset.serviceIds.some((id) => id.toLowerCase() === normalizedId)) {
        return { code: preset.code, suggestionGroups: preset.suggestionGroups };
      }
    }
  }

  const normalizedName = normalizeViText(input.name);
  if (!normalizedName) {
    return null;
  }

  for (const preset of SERVICE_SUGGESTION_OVERRIDES) {
    if (
      preset.excludeKeywords?.some((exKw) => normalizedName.includes(exKw))
    ) {
      continue;
    }
    if (preset.keywords.some((kw) => normalizedName.includes(kw))) {
      return { code: preset.code, suggestionGroups: preset.suggestionGroups };
    }
  }

  return null;
}
