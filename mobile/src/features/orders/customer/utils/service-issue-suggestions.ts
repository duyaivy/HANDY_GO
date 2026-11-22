import type { ServiceSuggestionGroup } from '@/features/catalog/types';
import { isSpecificServiceName, resolveServiceName } from '@/constants/services';

export type { ServiceSuggestionGroup };

export type SuggestionResolutionSource
  = | 'api-service'
    | 'api-category'
    | 'local-service'
    | 'local-category'
    | 'fallback';

export type ResolvedServiceSuggestions = {
  source: SuggestionResolutionSource;
  presetKey: string;
  groups: ServiceSuggestionGroup[];
};

export type ResolveServiceSuggestionsInput = {
  serviceId?: string | null;
  serviceName?: string | null;
  categoryName?: string | null;
  serviceSuggestionGroups?: unknown;
  categorySuggestionGroups?: unknown;
};

type LocalPresetDefinition = {
  presetKey: string;
  keywords: string[];
  groups: ServiceSuggestionGroup[];
};

const MAX_SUGGESTION_GROUPS = 6;
const MAX_GROUP_OPTIONS = 15;

/**
 * Strips Vietnamese accents/diacritics and normalizes text to lowercase alphanumeric words.
 */
export function normalizeVietnameseText(input?: string | null): string {
  if (!input || typeof input !== 'string') {
    return '';
  }
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Sanitizes and validates raw `suggestionGroups` payload from API/store.
 * Returns null if the input is empty or contains no valid groups, allowing the resolver
 * to safely fall back to the next tier without crashing the UI.
 */
export function normalizeSuggestionGroups(raw: unknown): ServiceSuggestionGroup[] | null {
  if (!Array.isArray(raw) || raw.length === 0) {
    return null;
  }

  const normalizedGroups: ServiceSuggestionGroup[] = [];
  const seenKeys = new Set<string>();

  for (const item of raw) {
    if (normalizedGroups.length >= MAX_SUGGESTION_GROUPS) {
      break;
    }
    if (!item || typeof item !== 'object') {
      continue;
    }

    const record = item as Record<string, unknown>;
    const rawKey = typeof record.key === 'string' ? record.key.trim().toLowerCase() : '';
    const key = rawKey.replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
    const label = typeof record.label === 'string' ? record.label.trim().slice(0, 80) : '';

    if (!key || !label || seenKeys.has(key) || !Array.isArray(record.options)) {
      continue;
    }

    const options: string[] = [];
    const seenOptions = new Set<string>();
    for (const rawOption of record.options) {
      if (options.length >= MAX_GROUP_OPTIONS) {
        break;
      }
      if (typeof rawOption !== 'string') {
        continue;
      }
      const trimmedOpt = rawOption.trim().slice(0, 80);
      if (!trimmedOpt) {
        continue;
      }
      const optLower = trimmedOpt.toLowerCase();
      if (seenOptions.has(optLower)) {
        continue;
      }
      seenOptions.add(optLower);
      options.push(trimmedOpt);
    }

    if (options.length === 0) {
      continue;
    }

    const descriptionPrefix
      = typeof record.descriptionPrefix === 'string' && record.descriptionPrefix.trim()
        ? record.descriptionPrefix.trim().slice(0, 60)
        : undefined;
    const selectionMode: 'single' | 'multiple'
      = record.selectionMode === 'multiple' ? 'multiple' : 'single';

    seenKeys.add(key);
    normalizedGroups.push({
      key,
      label,
      ...(descriptionPrefix ? { descriptionPrefix } : {}),
      selectionMode,
      options,
    });
  }

  return normalizedGroups.length > 0 ? normalizedGroups : null;
}

// ─── Shared Plumbing Preset (Matches Jira Mockup) ────────────────────────────

export const PLUMBING_SUGGESTION_GROUPS: ServiceSuggestionGroup[] = [
  {
    key: 'issue',
    label: 'Loại sự cố',
    descriptionPrefix: 'Sự cố',
    selectionMode: 'single',
    options: [
      'Rò rỉ nước',
      'Tắc nghẽn',
      'Vòi/thiết bị hỏng',
      'Lắp đặt mới',
      'Chưa rõ',
    ],
  },
  {
    key: 'location',
    label: 'Vị trí',
    descriptionPrefix: 'Vị trí',
    selectionMode: 'single',
    options: [
      'Nhà bếp',
      'Nhà tắm',
      'Sân vườn',
      'Tầng hầm',
      'Chưa rõ',
    ],
  },
  {
    key: 'severity',
    label: 'Mức độ',
    descriptionPrefix: 'Mức độ',
    selectionMode: 'single',
    options: [
      'Nhẹ (ít ảnh hưởng)',
      'Trung bình',
      'Nặng (ngập/nguy hiểm)',
      'Chưa rõ',
    ],
  },
];

// ─── Tier 3A: Specific Service Keyword Overrides (~16 Presets) ───────────────

export const LOCAL_SERVICE_OVERRIDES: LocalPresetDefinition[] = [
  {
    presetKey: 'ac_cleaning',
    keywords: ['ve sinh may lanh', 've sinh dieu hoa', 'bao duong ac', 'bao duong may lanh', 'rua may lanh'],
    groups: [
      {
        key: 'service_need',
        label: 'Nhu cầu dịch vụ',
        descriptionPrefix: 'Nhu cầu',
        selectionMode: 'single',
        options: [
          'Vệ sinh định kỳ',
          'Vệ sinh + Bơm thêm gas',
          'Máy chảy nước khi chạy',
          'Máy có mùi hôi / bám bụi',
          'Chưa rõ',
        ],
      },
      {
        key: 'device_type',
        label: 'Loại máy lạnh',
        descriptionPrefix: 'Loại máy',
        selectionMode: 'single',
        options: [
          'Treo tường',
          'Âm trần (Cassette)',
          'Tủ đứng',
          'Multi / Công nghiệp',
          'Chưa rõ',
        ],
      },
      {
        key: 'quantity',
        label: 'Số lượng máy',
        descriptionPrefix: 'Số lượng',
        selectionMode: 'single',
        options: [
          '1 máy',
          '2 máy',
          '3 - 4 máy',
          'Từ 5 máy trở lên',
          'Chưa rõ',
        ],
      },
    ],
  },
  {
    presetKey: 'ac_install',
    keywords: ['thao va lap dat may lanh', 'lap dat may lanh', 'thao lap may lanh', 'di doi may lanh', 'lap dieu hoa'],
    groups: [
      {
        key: 'service_need',
        label: 'Nhu cầu lắp đặt',
        descriptionPrefix: 'Nhu cầu',
        selectionMode: 'single',
        options: [
          'Lắp máy lạnh mới',
          'Tháo máy lạnh cũ',
          'Tháo và di dời sang vị trí mới',
          'Đi lại ống đồng / bảo ôn',
          'Chưa rõ',
        ],
      },
      {
        key: 'device_type',
        label: 'Công suất / Loại máy',
        descriptionPrefix: 'Loại máy',
        selectionMode: 'single',
        options: [
          '1 HP - 1.5 HP (Treo tường)',
          '2 HP - 2.5 HP',
          'Máy âm trần / Tủ đứng',
          'Chưa rõ',
        ],
      },
      {
        key: 'location',
        label: 'Vị trí dàn nóng',
        descriptionPrefix: 'Vị trí lắp',
        selectionMode: 'single',
        options: [
          'Ban công / Lô gia',
          'Tường ngoài (cần thang dây)',
          'Sân thượng / Mái nhà',
          'Tầng trệt',
          'Chưa rõ',
        ],
      },
    ],
  },
  {
    presetKey: 'ac_repair',
    keywords: ['sua may lanh', 'sua dieu hoa'],
    groups: [
      {
        key: 'issue',
        label: 'Tình trạng máy lạnh',
        descriptionPrefix: 'Tình trạng',
        selectionMode: 'single',
        options: [
          'Không lạnh / yếu lạnh',
          'Chảy nước dàn lạnh',
          'Kêu to / rung lắc',
          'Không lên nguồn / báo lỗi đèn',
          'Đóng tuyết / xì gas',
          'Chưa rõ',
        ],
      },
      {
        key: 'device_type',
        label: 'Loại máy lạnh',
        descriptionPrefix: 'Loại máy',
        selectionMode: 'single',
        options: [
          'Treo tường (Inverter)',
          'Treo tường (Thường)',
          'Âm trần / Tủ đứng',
          'Chưa rõ',
        ],
      },
      {
        key: 'severity',
        label: 'Mức độ ưu tiên',
        descriptionPrefix: 'Mức độ',
        selectionMode: 'single',
        options: [
          'Kiểm tra trong ngày',
          'Cần gấp ngay',
          'Đặt lịch hẹn trước',
          'Chưa rõ',
        ],
      },
    ],
  },
  {
    presetKey: 'fridge',
    keywords: ['sua tu lanh', 've sinh tu lanh', 'tu lanh', 'tu dong', 'tu mat'],
    groups: [
      {
        key: 'issue',
        label: 'Tình trạng tủ lạnh',
        descriptionPrefix: 'Tình trạng',
        selectionMode: 'single',
        options: [
          'Ngăn đá không đông',
          'Ngăn mát không lạnh',
          'Tủ chảy nước / đóng tuyết dày',
          'Kêu to / không chạy block',
          'Vệ sinh & khử mùi tủ lạnh',
          'Chưa rõ',
        ],
      },
      {
        key: 'device_type',
        label: 'Loại tủ lạnh',
        descriptionPrefix: 'Loại tủ',
        selectionMode: 'single',
        options: [
          'Tủ lạnh 2 cánh thường',
          'Tủ Side by Side / Inverter',
          'Tủ đông / Tủ mát trưng bày',
          'Tủ mini',
          'Chưa rõ',
        ],
      },
      {
        key: 'severity',
        label: 'Mức độ',
        descriptionPrefix: 'Mức độ',
        selectionMode: 'single',
        options: [
          'Cần xử lý sớm (đang trữ đồ)',
          'Bình thường',
          'Khẩn cấp',
          'Chưa rõ',
        ],
      },
    ],
  },
  {
    presetKey: 'washing_machine',
    keywords: ['sua may giat', 've sinh may giat', 'may giat', 'may say'],
    groups: [
      {
        key: 'issue',
        label: 'Tình trạng máy giặt',
        descriptionPrefix: 'Tình trạng',
        selectionMode: 'single',
        options: [
          'Không cấp / không xả nước',
          'Không vắt / không quay lồng',
          'Kêu to và rung lắc mạnh',
          'Báo lỗi màn hình / mất nguồn',
          'Vệ sinh lồng giặt định kỳ',
          'Chưa rõ',
        ],
      },
      {
        key: 'device_type',
        label: 'Loại máy giặt',
        descriptionPrefix: 'Loại máy',
        selectionMode: 'single',
        options: [
          'Cửa ngang (Lồng ngang)',
          'Cửa trên (Lồng đứng)',
          'Máy giặt sấy kết hợp',
          'Chưa rõ',
        ],
      },
      {
        key: 'severity',
        label: 'Mức độ',
        descriptionPrefix: 'Mức độ',
        selectionMode: 'single',
        options: [
          'Bình thường',
          'Cần sửa trong ngày',
          'Khẩn cấp (kẹt đồ/tràn nước)',
          'Chưa rõ',
        ],
      },
    ],
  },
  {
    presetKey: 'drain_toilet',
    keywords: ['thong cong', 'bon cau', 'nghet cong', 'tac cong', 'hut ham cau'],
    groups: [
      {
        key: 'issue',
        label: 'Tình trạng tắc / hỏng',
        descriptionPrefix: 'Tình trạng',
        selectionMode: 'single',
        options: [
          'Tắc bồn cầu / thoát chậm',
          'Nghẹt cống sàn nhà tắm',
          'Tắc chậu rửa chén (bồn bếp)',
          'Rò nước / hỏng phao xả bồn cầu',
          'Lắp mới / thay thế bồn cầu',
          'Chưa rõ',
        ],
      },
      {
        key: 'location',
        label: 'Khu vực',
        descriptionPrefix: 'Khu vực',
        selectionMode: 'single',
        options: [
          'Nhà vệ sinh / Phòng tắm',
          'Nhà bếp',
          'Hố ga / Cống thoát chính',
          'Ban công / Sân thượng',
          'Chưa rõ',
        ],
      },
      {
        key: 'severity',
        label: 'Mức độ',
        descriptionPrefix: 'Mức độ',
        selectionMode: 'single',
        options: [
          'Thoát nước chậm',
          'Tắc hoàn toàn',
          'Trào ngược / Bốc mùi nặng',
          'Chưa rõ',
        ],
      },
    ],
  },
  {
    presetKey: 'waterproofing',
    keywords: ['chong tham', 'tham tuong', 'tham tran', 'dot mai'],
    groups: [
      {
        key: 'issue',
        label: 'Hiện tượng thấm dột',
        descriptionPrefix: 'Tình trạng',
        selectionMode: 'single',
        options: [
          'Thấm trần nhà / sàn mái',
          'Thấm tường ngoài / khe tiếp giáp',
          'Thấm sàn nhà vệ sinh',
          'Dột mái tôn / máng xối',
          'Chưa rõ',
        ],
      },
      {
        key: 'area',
        label: 'Diện tích ước tính',
        descriptionPrefix: 'Quy mô',
        selectionMode: 'single',
        options: [
          'Vết thấm nhỏ cục bộ (< 5m²)',
          'Một phòng / khu vực (5 - 20m²)',
          'Toàn bộ sàn mái / tường lớn (> 20m²)',
          'Chưa rõ',
        ],
      },
      {
        key: 'severity',
        label: 'Mức độ',
        descriptionPrefix: 'Mức độ',
        selectionMode: 'single',
        options: [
          'Ẩm mốc / bong sơn nhẹ',
          'Nhỏ giọt khi mưa',
          'Thấm nặng ảnh hưởng sinh hoạt',
          'Chưa rõ',
        ],
      },
    ],
  },
  {
    presetKey: 'plumbing_water',
    keywords: ['sua ong nuoc', 'bao tri he thong nuoc', 'tho ong nuoc', 'sua ro ri nuoc'],
    groups: PLUMBING_SUGGESTION_GROUPS,
  },
  {
    presetKey: 'tv_audio',
    keywords: ['sua tivi', 'am thanh', 'loa', 'amply'],
    groups: [
      {
        key: 'issue',
        label: 'Tình trạng thiết bị',
        descriptionPrefix: 'Tình trạng',
        selectionMode: 'single',
        options: [
          'Mất nguồn / không lên hình',
          'Có tiếng nhưng mất hình',
          'Sọc màn hình / nhòe màu',
          'Không bắt được Wi-Fi / lỗi phần mềm',
          'Loa rè / mất âm thanh',
          'Chưa rõ',
        ],
      },
      {
        key: 'device_type',
        label: 'Loại thiết bị',
        descriptionPrefix: 'Thiết bị',
        selectionMode: 'single',
        options: [
          'Smart TV / LED / OLED',
          'Dàn âm thanh / Loa / Amply',
          'Tivi treo tường cần lắp giá đỡ',
          'Chưa rõ',
        ],
      },
      {
        key: 'severity',
        label: 'Mức độ',
        descriptionPrefix: 'Mức độ',
        selectionMode: 'single',
        options: [
          'Bình thường',
          'Cần kiểm tra trong ngày',
          'Chưa rõ',
        ],
      },
    ],
  },
  {
    presetKey: 'computer_printer_network',
    keywords: [
      'sua may tinh',
      'laptop',
      'bao duong may in',
      'may in',
      'lap dat va sua chua mang',
      'sua chua mang',
      'mang internet',
      'wifi',
    ],
    groups: [
      {
        key: 'issue',
        label: 'Vấn đề gặp phải',
        descriptionPrefix: 'Tình trạng',
        selectionMode: 'single',
        options: [
          'Máy tính không lên nguồn / chạy chậm / cài Win',
          'Mất kết nối mạng / Wi-Fi yếu / đứt dây mạng',
          'Máy in kẹt giấy / hết mực / không in được',
          'Lắp đặt mới bộ phát Wi-Fi / đi dây mạng LAN',
          'Vệ sinh & bảo dưỡng thiết bị định kỳ',
          'Chưa rõ',
        ],
      },
      {
        key: 'device_type',
        label: 'Thiết bị',
        descriptionPrefix: 'Thiết bị',
        selectionMode: 'single',
        options: [
          'Laptop / Máy tính để bàn (PC)',
          'Modem / Router Wi-Fi / Hệ thống mạng',
          'Máy in văn phòng / Máy photocopy',
          'Chưa rõ',
        ],
      },
      {
        key: 'severity',
        label: 'Mức độ ưu tiên',
        descriptionPrefix: 'Mức độ',
        selectionMode: 'single',
        options: [
          'Cần gấp để làm việc',
          'Trong ngày',
          'Đặt lịch hẹn',
          'Chưa rõ',
        ],
      },
    ],
  },
  {
    presetKey: 'roller_door',
    keywords: ['cua cuon', 'lap dat cua cuon', 'sua chua cua cuon'],
    groups: [
      {
        key: 'issue',
        label: 'Tình trạng cửa cuốn',
        descriptionPrefix: 'Tình trạng',
        selectionMode: 'single',
        options: [
          'Cửa kẹt nan / không đóng mở được',
          'Hỏng remote / hộp nhận tín hiệu',
          'Motor không chạy / kêu to',
          'Hỏng bình lưu điện (UPS)',
          'Lắp đặt / bảo dưỡng cửa cuốn',
          'Chưa rõ',
        ],
      },
      {
        key: 'severity',
        label: 'Mức độ khẩn cấp',
        descriptionPrefix: 'Mức độ',
        selectionMode: 'single',
        options: [
          'Khẩn cấp (kẹt bên ngoài/không khóa được)',
          'Cần xử lý trong ngày',
          'Bảo trì định kỳ',
          'Chưa rõ',
        ],
      },
    ],
  },
  {
    presetKey: 'locksmith',
    keywords: ['sua khoa', 'lam chia khoa', 'lap dat he thong khoa', 'khoa cua', 'khoa van tay'],
    groups: [
      {
        key: 'issue',
        label: 'Vấn đề về khóa',
        descriptionPrefix: 'Tình trạng',
        selectionMode: 'single',
        options: [
          'Mất chìa / quên chìa cần mở khóa',
          'Gãy chìa / kẹt ổ khóa',
          'Đánh thêm chìa / làm remote',
          'Thay ổ khóa mới / lắp khóa vân tay',
          'Sửa khóa két sắt / khóa xe',
          'Chưa rõ',
        ],
      },
      {
        key: 'lock_type',
        label: 'Loại khóa',
        descriptionPrefix: 'Loại khóa',
        selectionMode: 'single',
        options: [
          'Khóa tay gạt / Khóa nắm tròn',
          'Khóa điện tử / Vân tay / Thẻ từ',
          'Khóa cửa kính / Cửa sắt / Cửa cổng',
          'Khóa xe máy / Ô tô / Két sắt',
          'Chưa rõ',
        ],
      },
      {
        key: 'severity',
        label: 'Mức độ khẩn cấp',
        descriptionPrefix: 'Mức độ',
        selectionMode: 'single',
        options: [
          'Khẩn cấp (đang đứng ngoài cửa)',
          'Cần trong ngày',
          'Đặt lịch lắp đặt',
          'Chưa rõ',
        ],
      },
    ],
  },
  {
    presetKey: 'house_cleaning',
    keywords: ['don dep nha cua', 've sinh nha cua', 'giup viec theo gio', 'tong ve sinh'],
    groups: [
      {
        key: 'service_need',
        label: 'Loại hình dọn dẹp',
        descriptionPrefix: 'Nhu cầu',
        selectionMode: 'single',
        options: [
          'Dọn vệ sinh theo giờ',
          'Tổng vệ sinh nhà ở / căn hộ',
          'Vệ sinh sau xây dựng / sửa chữa',
          'Giặt sofa / nệm / rèm / thảm',
          'Chưa rõ',
        ],
      },
      {
        key: 'area',
        label: 'Quy mô / Diện tích',
        descriptionPrefix: 'Quy mô',
        selectionMode: 'single',
        options: [
          'Căn hộ / Nhà nhỏ (< 60m²)',
          'Nhà vừa (60 - 120m²)',
          'Nhà nhiều tầng / Biệt thự (> 120m²)',
          'Chưa rõ',
        ],
      },
      {
        key: 'extra',
        label: 'Yêu cầu dụng cụ',
        descriptionPrefix: 'Dụng cụ',
        selectionMode: 'single',
        options: [
          'Đã có sẵn dụng cụ cơ bản',
          'Cần thợ mang đầy đủ máy & hóa chất',
          'Chưa rõ',
        ],
      },
    ],
  },
  {
    presetKey: 'house_painting',
    keywords: ['son nha', 'son tuong', 'son lai nha'],
    groups: [
      {
        key: 'service_need',
        label: 'Hạng mục sơn',
        descriptionPrefix: 'Hạng mục',
        selectionMode: 'single',
        options: [
          'Sơn dặm vá tường cũ / bong tróc',
          'Sơn lại toàn bộ phòng / căn hộ',
          'Sơn mặt tiền / ngoại thất',
          'Bả matit + Sơn mới hoàn thiện',
          'Chưa rõ',
        ],
      },
      {
        key: 'area',
        label: 'Quy mô thi công',
        descriptionPrefix: 'Quy mô',
        selectionMode: 'single',
        options: [
          '1 phòng lẻ (< 30m² sàn)',
          'Căn hộ / Nhà vừa (30 - 100m²)',
          'Nhà nguyên căn / Công trình lớn',
          'Chưa rõ',
        ],
      },
      {
        key: 'material',
        label: 'Vật tư sơn',
        descriptionPrefix: 'Vật tư',
        selectionMode: 'single',
        options: [
          'Chủ nhà đã mua sẵn sơn',
          'Thợ báo giá trọn gói cả sơn & nhân công',
          'Cần thợ tư vấn chọn mã màu',
          'Chưa rõ',
        ],
      },
    ],
  },
  {
    presetKey: 'mom_baby_care',
    keywords: ['cham soc me va em be', 'cham soc me va be', 'cham soc me be', 'me va be', 'tam be'],
    groups: [
      {
        key: 'service_need',
        label: 'Gói chăm sóc',
        descriptionPrefix: 'Dịch vụ',
        selectionMode: 'single',
        options: [
          'Tắm bé & vệ sinh rốn chuẩn y khoa',
          'Massage phục hồi mẹ sau sinh',
          'Thông tắc tia sữa tại nhà',
          'Chăm sóc toàn diện mẹ và bé theo buổi',
          'Chưa rõ',
        ],
      },
      {
        key: 'schedule_mode',
        label: 'Hình thức đặt lịch',
        descriptionPrefix: 'Hình thức',
        selectionMode: 'single',
        options: [
          'Buổi lẻ trải nghiệm',
          'Theo liệu trình nhiều buổi',
          'Cần hỗ trợ ngay trong ngày',
          'Chưa rõ',
        ],
      },
    ],
  },
  {
    presetKey: 'moving_porter',
    keywords: ['boc xep hang hoa', 'boc xep', 'van chuyen hang hoa', 'khuan vac', 'chuyen nha', 'chuyen tro'],
    groups: [
      {
        key: 'service_need',
        label: 'Nhu cầu vận chuyển',
        descriptionPrefix: 'Nhu cầu',
        selectionMode: 'single',
        options: [
          'Bốc xếp hàng hóa / đồ đạc',
          'Chuyển nhà / chuyển phòng trọ trọn gói',
          'Chuyển văn phòng / kho xưởng',
          'Khiêng đồ nặng lên xuống tầng',
          'Chưa rõ',
        ],
      },
      {
        key: 'terrain',
        label: 'Địa hình di chuyển',
        descriptionPrefix: 'Địa hình',
        selectionMode: 'single',
        options: [
          'Có thang máy',
          'Thang bộ (nhà tầng)',
          'Hẻm nhỏ / xe tải đậu xa',
          'Tầng trệt thuận tiện',
          'Chưa rõ',
        ],
      },
      {
        key: 'volume',
        label: 'Khối lượng đồ',
        descriptionPrefix: 'Khối lượng',
        selectionMode: 'single',
        options: [
          'Ít đồ / vài kiện lẻ',
          'Vừa (1 phòng trọ / xe tải nhỏ)',
          'Nhiều đồ (nguyên căn / cần nhiều người)',
          'Chưa rõ',
        ],
      },
    ],
  },
];

// ─── Tier 3B: Category Presets (~12 Categories) ──────────────────────────────

export const LOCAL_CATEGORY_PRESETS: LocalPresetDefinition[] = [
  {
    presetKey: 'cat_plumbing',
    keywords: ['ong nuoc', 'he thong nuoc', 'cap thoat nuoc', 'tho ong nuoc', 'ro ri nuoc', 'dien nuoc'],
    groups: PLUMBING_SUGGESTION_GROUPS,
  },
  {
    presetKey: 'cat_electrical',
    keywords: ['sua dien', 'he thong dien', 'chieu sang', 'tho sua dien', 'dien dan dung', 'chap dien', 'bong den'],
    groups: [
      {
        key: 'issue',
        label: 'Loại sự cố điện',
        descriptionPrefix: 'Sự cố',
        selectionMode: 'single',
        options: [
          'Mất điện cục bộ / nhảy CB (Aptomat)',
          'Chập điện / có mùi khét / tia lửa',
          'Hỏng ổ cắm / công tắc / bóng đèn',
          'Lắp đặt / đi lại đường dây điện mới',
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
          'Nhà bếp / Phòng tắm',
          'Tủ điện tổng / Đồng hồ điện',
          'Đèn sân vườn / Ban công',
          'Chưa rõ',
        ],
      },
      {
        key: 'severity',
        label: 'Mức độ khẩn cấp',
        descriptionPrefix: 'Mức độ',
        selectionMode: 'single',
        options: [
          'Bình thường',
          'Mất điện sinh hoạt cần sửa ngay',
          'Khẩn cấp (chập cháy nguy hiểm)',
          'Chưa rõ',
        ],
      },
    ],
  },
  {
    presetKey: 'cat_hvac',
    keywords: ['dien lanh', 'may lanh', 'dieu hoa', 'tu lanh', 'may nuoc nong', 'binh nong lanh'],
    groups: [
      {
        key: 'issue',
        label: 'Tình trạng thiết bị',
        descriptionPrefix: 'Tình trạng',
        selectionMode: 'single',
        options: [
          'Không lạnh / không làm nóng',
          'Vệ sinh & bảo dưỡng định kỳ',
          'Chảy nước / kêu to',
          'Mất nguồn / báo lỗi đèn',
          'Tháo lắp / di dời thiết bị',
          'Chưa rõ',
        ],
      },
      {
        key: 'device_type',
        label: 'Thiết bị điện lạnh',
        descriptionPrefix: 'Thiết bị',
        selectionMode: 'single',
        options: [
          'Máy lạnh (Điều hòa)',
          'Tủ lạnh / Tủ đông',
          'Bình nóng lạnh / Máy nước nóng',
          'Chưa rõ',
        ],
      },
      {
        key: 'severity',
        label: 'Mức độ',
        descriptionPrefix: 'Mức độ',
        selectionMode: 'single',
        options: [
          'Bình thường',
          'Cần xử lý trong ngày',
          'Khẩn cấp',
          'Chưa rõ',
        ],
      },
    ],
  },
  {
    presetKey: 'cat_appliance',
    keywords: [
      'dien gia dung',
      'sua gia dung',
      'gia dung',
      'lo vi song',
      'bep tu',
      'may rua chen',
      'noi com',
      'quat dien',
      'may hut mui',
      'may loc nuoc',
      'robot hut bui',
    ],
    groups: [
      {
        key: 'issue',
        label: 'Tình trạng thiết bị',
        descriptionPrefix: 'Tình trạng',
        selectionMode: 'single',
        options: [
          'Không vào điện / mất nguồn',
          'Hoạt động chập chờn / báo lỗi',
          'Có mùi khét / kêu bất thường',
          'Hỏng linh kiện / cần thay phụ tùng',
          'Bảo dưỡng / vệ sinh thiết bị',
          'Chưa rõ',
        ],
      },
      {
        key: 'device_type',
        label: 'Nhóm thiết bị',
        descriptionPrefix: 'Thiết bị',
        selectionMode: 'single',
        options: [
          'Bếp từ / Lò vi sóng / Nồi chiên',
          'Máy nước nóng / Máy lọc nước',
          'Quạt điện / Máy hút bụi / Robot',
          'Thiết bị gia dụng khác',
          'Chưa rõ',
        ],
      },
      {
        key: 'severity',
        label: 'Mức độ',
        descriptionPrefix: 'Mức độ',
        selectionMode: 'single',
        options: [
          'Bình thường',
          'Cần sửa trong ngày',
          'Khẩn cấp',
          'Chưa rõ',
        ],
      },
    ],
  },
  {
    presetKey: 'cat_electronics_it',
    keywords: ['dien tu', 'cong nghe', 'cntt', 'thiet bi so', 'camera'],
    groups: [
      {
        key: 'issue',
        label: 'Tình trạng thiết bị',
        descriptionPrefix: 'Tình trạng',
        selectionMode: 'single',
        options: [
          'Không lên nguồn / mất tín hiệu',
          'Lỗi kết nối / lỗi phần mềm',
          'Hỏng màn hình / âm thanh / linh kiện',
          'Lắp đặt & cấu hình thiết bị mới',
          'Bảo dưỡng định kỳ',
          'Chưa rõ',
        ],
      },
      {
        key: 'severity',
        label: 'Mức độ ưu tiên',
        descriptionPrefix: 'Mức độ',
        selectionMode: 'single',
        options: [
          'Bình thường',
          'Cần hỗ trợ trong ngày',
          'Khẩn cấp',
          'Chưa rõ',
        ],
      },
    ],
  },
  {
    presetKey: 'cat_door_glass',
    keywords: ['nhom kinh', 'cua kinh', 'vach ngan nhom', 'cua nhom', 'kinh cuong luc', 'cua go', 'cua nhua'],
    groups: [
      {
        key: 'service_need',
        label: 'Nhu cầu dịch vụ',
        descriptionPrefix: 'Nhu cầu',
        selectionMode: 'single',
        options: [
          'Sửa cửa xệ bản lề / kẹt ray trượt',
          'Thay kính vỡ / phụ kiện tay nắm',
          'Lắp đặt mới cửa kính / vách ngăn',
          'Vệ sinh kính mặt trong / mặt ngoài',
          'Chưa rõ',
        ],
      },
      {
        key: 'door_type',
        label: 'Loại cửa / Vách',
        descriptionPrefix: 'Hạng mục',
        selectionMode: 'single',
        options: [
          'Cửa kính cường lực / Cửa lùa',
          'Cửa sổ / Cửa đi nhôm Xingfa',
          'Vách ngăn nhôm kính văn phòng / nhà ở',
          'Chưa rõ',
        ],
      },
      {
        key: 'severity',
        label: 'Mức độ',
        descriptionPrefix: 'Mức độ',
        selectionMode: 'single',
        options: [
          'Khảo sát & báo giá',
          'Cần xử lý trong ngày',
          'Khẩn cấp (cửa không đóng được/vỡ kính)',
          'Chưa rõ',
        ],
      },
    ],
  },
  {
    presetKey: 'cat_mechanical_welding',
    keywords: ['co khi', 'tho sat', 'tho han', 'tho tien', 'sat han', 'mai ton', 'khung sat', 'lan can', 'cua sat', 'inox'],
    groups: [
      {
        key: 'service_need',
        label: 'Công việc cơ khí',
        descriptionPrefix: 'Công việc',
        selectionMode: 'single',
        options: [
          'Hàn sửa cửa sắt / cổng sắt bị sệ, gãy',
          'Gia công khung bảo vệ / chuồng cọp / lan can',
          'Lợp / sửa mái tôn, khung kèo sắt',
          'Gia công / tiện chi tiết cơ khí theo mẫu',
          'Chưa rõ',
        ],
      },
      {
        key: 'location',
        label: 'Vị trí thi công',
        descriptionPrefix: 'Vị trí',
        selectionMode: 'single',
        options: [
          'Cửa cổng / Hàng rào tầng trệt',
          'Ban công / Sân thượng / Mái nhà',
          'Trong nhà / Xưởng',
          'Chưa rõ',
        ],
      },
      {
        key: 'material',
        label: 'Vật tư',
        descriptionPrefix: 'Vật tư',
        selectionMode: 'single',
        options: [
          'Cần thợ mang máy hàn & vật tư trọn gói',
          'Đã có sẵn vật tư, chỉ thuê công thợ',
          'Cần khảo sát đo đạc trước',
          'Chưa rõ',
        ],
      },
    ],
  },
  {
    presetKey: 'cat_locksmith',
    keywords: ['khoa', 'chia khoa', 'tho khoa'],
    groups: LOCAL_SERVICE_OVERRIDES.find(item => item.presetKey === 'locksmith')!.groups,
  },
  {
    presetKey: 'cat_vehicle',
    keywords: ['sua xe', 'xe may', 'xe oto', 'o to', 'son o to', 'va lop', 'thay lop', 'cuu ho xe', 'ac quy'],
    groups: [
      {
        key: 'issue',
        label: 'Tình trạng xe',
        descriptionPrefix: 'Tình trạng',
        selectionMode: 'single',
        options: [
          'Không đề được / hết bình ắc quy',
          'Thủng lốp / cần vá hoặc thay lốp',
          'Chết máy giữa đường / ngập nước',
          'Trầy xước sơn / đồng sơn thân vỏ',
          'Bảo dưỡng định kỳ / thay nhớt tại nhà',
          'Chưa rõ',
        ],
      },
      {
        key: 'vehicle_type',
        label: 'Loại phương tiện',
        descriptionPrefix: 'Phương tiện',
        selectionMode: 'single',
        options: [
          'Xe số / Xe côn tay',
          'Xe tay ga / Xe máy điện',
          'Ô tô con (4 - 7 chỗ)',
          'Xe tải nhỏ / Bán tải',
          'Chưa rõ',
        ],
      },
      {
        key: 'location',
        label: 'Vị trí hiện tại',
        descriptionPrefix: 'Vị trí',
        selectionMode: 'single',
        options: [
          'Tại nhà / Hầm chung cư',
          'Đang gặp sự cố trên đường (Cứu hộ)',
          'Tại cơ quan / Bãi đỗ xe',
          'Chưa rõ',
        ],
      },
    ],
  },
  {
    presetKey: 'cat_home_cleaning',
    keywords: ['ve sinh', 'don dep', 'tap vu', 'diet con trung'],
    groups: LOCAL_SERVICE_OVERRIDES.find(item => item.presetKey === 'house_cleaning')!.groups,
  },
  {
    presetKey: 'cat_construction_renovation',
    keywords: ['xay dung', 'cai tao', 'op lat', 'thach cao', 'noi that', 'moc', 'sua nha'],
    groups: [
      {
        key: 'service_need',
        label: 'Hạng mục thi công',
        descriptionPrefix: 'Hạng mục',
        selectionMode: 'single',
        options: [
          'Sửa chữa / cải tạo hạng mục hư hỏng',
          'Thi công lắp đặt mới theo yêu cầu',
          'Khảo sát thực tế & tư vấn báo giá',
          'Bảo trì / hoàn thiện công trình',
          'Chưa rõ',
        ],
      },
      {
        key: 'material',
        label: 'Vật tư thi công',
        descriptionPrefix: 'Vật tư',
        selectionMode: 'single',
        options: [
          'Thợ báo giá trọn gói cả vật tư & nhân công',
          'Chủ nhà đã chuẩn bị sẵn vật tư',
          'Cần thợ khảo sát tư vấn thêm',
          'Chưa rõ',
        ],
      },
    ],
  },
  {
    presetKey: 'cat_family_care_moving',
    keywords: ['cham soc me', 'me va be', 'me va em be', 'cham soc gia dinh', 'van chuyen', 'boc xep'],
    groups: LOCAL_SERVICE_OVERRIDES.find(item => item.presetKey === 'moving_porter')!.groups,
  },
];

// ─── Tier 4: Neutral Universal Fallback ──────────────────────────────────────

export const GENERIC_FALLBACK_SUGGESTION_GROUPS: ServiceSuggestionGroup[] = [
  {
    key: 'service_need',
    label: 'Nhu cầu / Tình trạng',
    descriptionPrefix: 'Nhu cầu',
    selectionMode: 'single',
    options: [
      'Kiểm tra & sửa chữa sự cố',
      'Lắp đặt / thay thế mới',
      'Bảo dưỡng / vệ sinh định kỳ',
      'Tư vấn & khảo sát báo giá',
      'Chưa rõ',
    ],
  },
  {
    key: 'severity',
    label: 'Mức độ ưu tiên',
    descriptionPrefix: 'Mức độ',
    selectionMode: 'single',
    options: [
      'Bình thường (theo lịch hẹn)',
      'Cần hỗ trợ trong ngày',
      'Khẩn cấp (cần xử lý ngay)',
      'Chưa rõ',
    ],
  },
];

function matchPresetByText(
  normalizedText: string,
  presets: LocalPresetDefinition[],
): LocalPresetDefinition | null {
  if (!normalizedText) {
    return null;
  }
  for (const preset of presets) {
    if (preset.keywords.some(keyword => normalizedText.includes(keyword))) {
      return preset;
    }
  }
  return null;
}

/**
 * 4-Tier Suggestion Resolver:
 * 1. API Service (`service.suggestionGroups`)
 * 2. API Category (`category.suggestionGroups`)
 * 3. Local Preset (`LOCAL_SERVICE_OVERRIDES` -> `LOCAL_CATEGORY_PRESETS`)
 * 4. Neutral Fallback (`GENERIC_FALLBACK_SUGGESTION_GROUPS`)
 */
export function resolveServiceSuggestions(
  input: ResolveServiceSuggestionsInput = {},
): ResolvedServiceSuggestions {
  // Tier 1: API Service override
  const apiServiceGroups = normalizeSuggestionGroups(input.serviceSuggestionGroups);
  if (apiServiceGroups) {
    return {
      source: 'api-service',
      presetKey: 'api-service',
      groups: apiServiceGroups,
    };
  }

  // Tier 2: API Category default
  const apiCategoryGroups = normalizeSuggestionGroups(input.categorySuggestionGroups);
  if (apiCategoryGroups) {
    return {
      source: 'api-category',
      presetKey: 'api-category',
      groups: apiCategoryGroups,
    };
  }

  // Tier 3: Local preset matching (service override -> category preset)
  const resolvedName = resolveServiceName(input.serviceId, input.serviceName);
  const specificResolvedName = isSpecificServiceName(resolvedName) ? resolvedName : '';
  const normalizedServiceText = normalizeVietnameseText(
    [input.serviceName, specificResolvedName, input.serviceId].filter(Boolean).join(' '),
  );
  const normalizedCategoryText = normalizeVietnameseText(input.categoryName);

  const matchedServiceOverride = matchPresetByText(normalizedServiceText, LOCAL_SERVICE_OVERRIDES);
  if (matchedServiceOverride) {
    return {
      source: 'local-service',
      presetKey: matchedServiceOverride.presetKey,
      groups: matchedServiceOverride.groups,
    };
  }

  const matchedCategoryFromCategoryName = matchPresetByText(
    normalizedCategoryText,
    LOCAL_CATEGORY_PRESETS,
  );
  if (matchedCategoryFromCategoryName) {
    return {
      source: 'local-category',
      presetKey: matchedCategoryFromCategoryName.presetKey,
      groups: matchedCategoryFromCategoryName.groups,
    };
  }

  const matchedCategoryFromServiceName = matchPresetByText(
    normalizedServiceText,
    LOCAL_CATEGORY_PRESETS,
  );
  if (matchedCategoryFromServiceName) {
    return {
      source: 'local-category',
      presetKey: matchedCategoryFromServiceName.presetKey,
      groups: matchedCategoryFromServiceName.groups,
    };
  }

  // Tier 4: Neutral fallback
  return {
    source: 'fallback',
    presetKey: 'generic_fallback',
    groups: GENERIC_FALLBACK_SUGGESTION_GROUPS,
  };
}

function isUnknownOption(value: string): boolean {
  const normalized = normalizeVietnameseText(value);
  return normalized === 'chua ro';
}

/**
 * Formats selected chips across dynamic suggestion groups into a single summary string.
 * Example: "Tình trạng: Không lạnh / yếu lạnh - Loại máy: Treo tường"
 * Ignores 'Chưa rõ' values.
 */
export function formatSuggestionSelection(
  groups: ServiceSuggestionGroup[],
  selectedByGroup: Record<string, string[]>,
): string {
  const parts: string[] = [];

  for (const group of groups) {
    const rawValues = selectedByGroup[group.key];
    if (!Array.isArray(rawValues) || rawValues.length === 0) {
      continue;
    }

    const validValues = rawValues
      .map(val => (typeof val === 'string' ? val.trim() : ''))
      .filter(val => Boolean(val) && !isUnknownOption(val));

    if (validValues.length === 0) {
      continue;
    }

    const prefix = (group.descriptionPrefix || group.label).trim();
    parts.push(`${prefix}: ${validValues.join(', ')}`);
  }

  return parts.join(' - ');
}

export type MergeDescriptionWithSuggestionsParams = {
  currentDescription: string;
  /**
   * Exact segment the system inserted on the previous merge (provenance), as returned in
   * `generatedText`. Only this segment is ever removed; user free text is never pattern-matched.
   */
  previousGeneratedText: string;
  nextChipText: string;
  serviceName?: string | null;
};

export type MergeDescriptionWithSuggestionsResult = {
  description: string;
  /** Exact segment inserted by the system in `description` ('' when nothing was inserted). */
  generatedText: string;
};

/**
 * Non-destructively merges dynamic suggestion chip text with user custom typed description.
 * - Only removes the exact segment previously generated by the system (tracked via provenance).
 * - Never deletes or rewrites user free text, even if it looks like `Sự cố: ...`.
 * - Formats as `Tôi cần người <serviceName>: <nextChipText>` when there is no custom text.
 * - Formats as `<customText>. <nextChipText>` when user has entered custom text.
 */
export function mergeDescriptionWithSuggestions({
  currentDescription,
  previousGeneratedText,
  nextChipText,
  serviceName,
}: MergeDescriptionWithSuggestionsParams): MergeDescriptionWithSuggestionsResult {
  let baseText = currentDescription || '';

  const prevGenerated = previousGeneratedText || '';
  if (prevGenerated) {
    const idx = baseText.lastIndexOf(prevGenerated);
    if (idx !== -1) {
      baseText = baseText.slice(0, idx) + baseText.slice(idx + prevGenerated.length);
    }
  }

  const cleanServiceName = isSpecificServiceName(serviceName) ? serviceName.trim() : '';
  const defaultPrefix = cleanServiceName ? `Tôi cần người ${cleanServiceName}` : '';
  // Exact system quick-fill text ("Tôi cần người <service>") is not user content.
  const isBaseOnlyPrefix = Boolean(
    defaultPrefix && baseText.trim().toLowerCase() === defaultPrefix.toLowerCase(),
  );
  const hasUserText = Boolean(baseText.trim()) && !isBaseOnlyPrefix;

  const trimmedNextChip = (nextChipText || '').trim();

  if (!trimmedNextChip) {
    return { description: hasUserText ? baseText : '', generatedText: '' };
  }

  if (hasUserText) {
    const separator = /[.!?]\s*$/.test(baseText) ? (/\s$/.test(baseText) ? '' : ' ') : '. ';
    const generatedText = `${separator}${trimmedNextChip}`;
    return { description: `${baseText}${generatedText}`, generatedText };
  }

  const generatedText = defaultPrefix ? `${defaultPrefix}: ${trimmedNextChip}` : trimmedNextChip;
  return { description: generatedText, generatedText };
}

/**
 * Checks if a description starts with a structured suggestion prefix (e.g. "Sự cố: ...", "Tình trạng: ...", "Nhu cầu: ...")
 * without already having the "Tôi cần người <serviceName>" prefix.
 */
export function startsWithSuggestionPrefix(description?: string | null): boolean {
  if (!description || typeof description !== 'string') {
    return false;
  }
  const trimmed = description.trim();
  const colonIndex = trimmed.indexOf(':');
  if (colonIndex < 2 || colonIndex > 35) {
    return false;
  }
  const prefixPart = trimmed.slice(0, colonIndex).trim();
  const afterColon = trimmed.slice(colonIndex + 1).trim();
  if (!prefixPart || !afterColon) {
    return false;
  }
  const normalizedPrefix = normalizeVietnameseText(prefixPart);
  if (!normalizedPrefix || /^\d+$/.test(normalizedPrefix)) {
    return false;
  }
  if (
    normalizedPrefix.startsWith('toi can')
    || normalizedPrefix.startsWith('can tho')
    || normalizedPrefix.startsWith('can nguoi')
  ) {
    return false;
  }
  return normalizedPrefix.split(' ').length <= 5;
}
