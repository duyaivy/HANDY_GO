export const KNOWN_SERVICES_BY_ID: Record<string, string> = {
  // UUIDs from Catalog Service & Database
  'a26e3c78-f202-4ec0-a2f9-2462371d05a4': 'Vệ sinh máy lạnh',
  '34ec7df5-20db-401e-804a-6feee5b48184': 'Sửa máy lạnh',
  '4607a579-8fb0-4261-9be4-679b97e96a95': 'Sửa tủ lạnh',
  '6198feb0-dd81-4647-b12b-6afce3492bb7': 'Tháo và lắp đặt máy lạnh',
  'a02d5013-a2d0-437e-8195-d1591352e23c': 'Vệ sinh tủ lạnh',
  'a34626a6-fbe8-44fe-9ceb-33e85285b0e8': 'Sửa điện',
  '2e5e21b9-6768-4ff3-904f-51d5766d6f74': 'Lắp đặt hệ thống điện',
  '8dd10a77-0cc0-4b04-8854-30b0a40e5ccb': 'Hệ thống chiếu sáng',
  'b1026b8e-dd6c-478b-aeab-1afb582bcfd0': 'Sửa ống nước',
  '0ae3c4ef-005f-43c2-a995-c36d0a85da1c': 'Thông cống',
  '27bf0049-8059-4661-9450-5de5c09e924e': 'Bảo trì hệ thống nước',
  'bafb30bd-7908-42b8-bb31-b2d6c2132700': 'Lắp đặt và sửa chữa bồn cầu',
  'cbb1b85c-32f9-4041-a0fd-df5cde04784f': 'Sửa máy giặt',
  '82ec4aaa-48ed-4711-a318-7a5e9cd3ab8a': 'Vệ sinh máy giặt',
  'b676caef-62e8-475c-afa1-35b772bb4ffe': 'Sửa điện gia dụng khác',
  '2f77c5e1-f653-4de8-b0b7-8ce969394d2e': 'Sửa tivi',
  '564e6916-2937-440b-90dc-9219d98a7823': 'Điện tử gia dụng',
  '9a2432cf-7170-404b-89ee-c67589dc3581': 'Bảo dưỡng máy in',
  '6b262019-0b59-44b2-9ca1-e57d8a157641': 'Lắp đặt và sửa chữa mạng',
  '7064eadb-3972-44a9-9f8a-bd12e5abab51': 'Sửa tivi và âm thanh',
  '795ff33f-38cd-4ba6-9a96-56dbf0fc8401': 'Cửa nhôm kính',
  '216c282e-1f9c-4e05-9fe8-4a67296e92b5': 'Lắp đặt cửa kính',
  '6bf3ebba-b0da-4676-86a7-b2bce3f7e375': 'Thi công vách ngăn nhôm',
  '1599bb92-c0c4-4649-82d5-186649bcc534': 'Vệ sinh cửa kính',
  'c8cb7fd1-56f4-42e5-a4c6-be30b4235fcd': 'Thợ sắt',
  'c5e4bb59-716a-4951-82b3-93a1f3ea094d': 'Thợ hàn',
  '38b95d0a-8b1b-415f-a194-12b0d32e3516': 'Thợ tiện',
  'e8da7d52-efc6-41dc-af48-e58fe9d22a62': 'Sửa khoá và làm chìa khoá',
  'bce31380-4e68-4251-9646-871830532ec1': 'Lắp đặt hệ thống khoá',
  '5bbb2caa-0f6a-4f7a-b48b-a7d5c91f2ce3': 'Sửa xe máy',
  '253e55aa-f41f-4a2f-8b17-768b9166865a': 'Sửa xe oto',
  '20b7445c-96fc-4180-bae9-9d336924b72c': 'Sơn ô tô',
  '7e847933-e733-409c-b0c1-3d4972f44f22': 'Thay và vá lốp xe',
  'fe146375-2e57-460e-b470-d745678fc96d': 'Lắp đặt cửa cuốn',
  '8b11f4d5-f5bc-41df-880b-adcf93cf54f4': 'Bảo trì và sửa chữa cửa cuốn',
  '26801324-11d6-4a96-8d1c-da1125451e21': 'Sửa máy tính',
  '4c441301-efeb-43d1-ae58-a51a4eb90997': 'Dọn dẹp nhà cửa',
  '3c049147-4803-40e6-9ebb-37a313fad5e9': 'Sơn nhà',

  // Short IDs & Demo codes
  'srv-01': 'Sửa ống nước',
  'srv-1': 'Sửa ống nước',
  'srv-ac': 'Sửa máy lạnh',
  'srv-plumb': 'Thợ ống nước',
  'srv-ac-mnt': 'Bảo dưỡng AC',
  'srv-electric': 'Thợ sửa điện',
  'srv-appliance': 'Sửa gia dụng',
  'srv-drain': 'Thông cống',
  'srv-waterproof': 'Chống thấm',
  'srv-lock': 'Sửa khóa cửa',
  'srv-water-leak': 'Sửa rò rỉ nước',
  'srv-washing-machine': 'Sửa máy giặt',

  // Chăm sóc mẹ và em bé & Dịch vụ gia đình
  'srv-care-mom-baby': 'Chăm sóc mẹ và em bé',
  'srv-mom-baby': 'Chăm sóc mẹ và em bé',
  'cham-soc-me-va-be': 'Chăm sóc mẹ và em bé',
  'cham-soc-me-be': 'Chăm sóc mẹ và em bé',
  'me-va-be': 'Chăm sóc mẹ và em bé',
  'me-be': 'Chăm sóc mẹ và em bé',
  'srv-clean': 'Dọn dẹp nhà cửa',
  'srv-paint': 'Sơn nhà',
};

/**
 * Resolves service title from serviceId, fallback name, or description.
 * Prevents unintentional drift to default generic 'Dịch vụ tiện ích'.
 */
export function resolveServiceName(
  serviceId?: string | null,
  fallbackName?: string | null,
  description?: string | null,
): string {
  if (fallbackName && fallbackName.trim() && fallbackName.trim() !== 'Dịch vụ tiện ích') {
    return fallbackName.trim();
  }

  if (serviceId) {
    if (KNOWN_SERVICES_BY_ID[serviceId]) {
      return KNOWN_SERVICES_BY_ID[serviceId];
    }
    const idLower = serviceId.toLowerCase();
    if (
      idLower.includes('me-be')
      || idLower.includes('me-va-be')
      || idLower.includes('mom')
      || idLower.includes('baby')
      || idLower.includes('cham-soc')
    ) {
      return 'Chăm sóc mẹ và em bé';
    }
    if (idLower.includes('plumb') || idLower.includes('water') || idLower.includes('nuoc')) {
      return 'Sửa ống nước';
    }
    if (idLower.includes('wash') || idLower.includes('giat')) {
      return 'Sửa máy giặt';
    }
    if (idLower.includes('ac') || idLower.includes('lanh')) {
      return 'Sửa máy lạnh';
    }
    if (idLower.includes('electric') || idLower.includes('dien')) {
      return 'Thợ sửa điện';
    }
    if (idLower.includes('paint') || idLower.includes('son')) {
      return 'Sơn nhà';
    }
    if (idLower.includes('clean') || idLower.includes('don-dep')) {
      return 'Dọn dẹp nhà cửa';
    }
  }

  if (description) {
    const desc = description.trim();
    const descLower = desc.toLowerCase();
    if (
      descLower.includes('chăm sóc mẹ')
      || descLower.includes('mẹ và em bé')
      || descLower.includes('mẹ và bé')
      || descLower.includes('mẹ & bé')
    ) {
      return 'Chăm sóc mẹ và em bé';
    }

    const match = desc.match(
      /(?:Tôi\s+cần\s+(?:thợ|người|dịch\s+vụ)?\s*|Cần\s+(?:thợ|người)?\s*)(.*?)(?:\s+đến|\s+tận|\s+hỗ\s+trợ|\s+phục\s+vụ|\.|$|,)/i,
    );
    if (match && match[1]) {
      const extracted = match[1].trim();
      if (extracted && !extracted.toLowerCase().includes('hỗ trợ') && extracted.length < 50) {
        return extracted.replace(/bão dưỡng/i, 'Bảo dưỡng');
      }
    }
  }

  return (fallbackName && fallbackName.trim()) || 'Dịch vụ tiện ích';
}
