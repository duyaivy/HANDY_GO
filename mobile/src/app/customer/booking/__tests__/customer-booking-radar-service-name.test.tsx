import * as React from 'react';
import { resolveServiceName } from '@/constants/services';
import { OrdersApi } from '@/features/orders/api/orders.api';
import { useBookingDraftStore } from '@/features/orders/stores/use-booking-draft-store';
import { cleanup, render, screen, waitFor } from '@/lib/test-utils';
import CustomerBookingRadarScreen from '../radar';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

let mockSearchParams: Record<string, string> = { requestId: 'req-service-name-001' };

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: () => true,
  })),
  useLocalSearchParams: jest.fn(() => mockSearchParams),
}));

jest.mock('@/components/map/handy-map', () => ({
  HandyMap: () => null,
}));

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
  mockSearchParams = { requestId: 'req-service-name-001' };
  useBookingDraftStore.getState().resetDraft();
});

describe('customerBookingRadarScreen - Service Name Preservation (TASK-04 Followup)', () => {
  describe('resolveServiceName unit tests', () => {
    it('resolves mother and baby care service correctly from slug, name, or description', () => {
      expect(resolveServiceName('cham-soc-me-be')).toBe('Chăm sóc mẹ và em bé');
      expect(resolveServiceName('me-va-be')).toBe('Chăm sóc mẹ và em bé');
      expect(resolveServiceName('srv-care-mom-baby')).toBe('Chăm sóc mẹ và em bé');
      expect(resolveServiceName(null, 'Chăm sóc mẹ và em bé')).toBe('Chăm sóc mẹ và em bé');
      expect(resolveServiceName(null, null, 'Tôi cần người Chăm sóc mẹ và em bé')).toBe('Chăm sóc mẹ và em bé');
    });

    it('resolves all other service categories across the entire system from slug or description', () => {
      // Điện lạnh
      expect(resolveServiceName('sua-tu-lanh-inverter')).toBe('Sửa tủ lạnh');
      expect(resolveServiceName('ve-sinh-may-lanh-daikin')).toBe('Vệ sinh máy lạnh');
      expect(resolveServiceName('sua-may-giat-electrolux')).toBe('Sửa máy giặt');
      // Thoát nước & Ống nước
      expect(resolveServiceName('thong-cong-nghet')).toBe('Thông cống');
      expect(resolveServiceName('chong-tham-san-thuong')).toBe('Chống thấm');
      expect(resolveServiceName('sua-ong-nuoc-ro-ri')).toBe('Sửa ống nước');
      // Khóa cửa & Cửa cuốn
      expect(resolveServiceName('sua-khoa-van-tay')).toBe('Sửa khoá và làm chìa khoá');
      expect(resolveServiceName('sua-cua-cuon-austdoor')).toBe('Bảo trì và sửa chữa cửa cuốn');
      // Điện & Xe cộ
      expect(resolveServiceName('tho-sua-dien-dan-dung')).toBe('Thợ sửa điện');
      expect(resolveServiceName('sua-xe-may-honda')).toBe('Sửa xe máy');
      expect(resolveServiceName('sua-xe-oto-4-cho')).toBe('Sửa xe oto');
      // Phân giải từ mô tả (Description extraction)
      expect(resolveServiceName(null, null, 'Cần thợ thông cống nghẹt bồn rửa bát')).toBe('Thông cống');
      expect(resolveServiceName(null, null, 'Nhà tôi cần vệ sinh máy lạnh 2 phòng ngủ')).toBe('Vệ sinh máy lạnh');
      expect(resolveServiceName(null, null, 'Cần thợ sửa khóa cửa chính bị kẹt chìa')).toBe('Sửa khoá và làm chìa khoá');
    });

    it('falls back safely when no specific service is recognized', () => {
      expect(resolveServiceName(null, null, null)).toBe('Dịch vụ tiện ích');
      expect(resolveServiceName(null, 'Dịch vụ tiện ích', null)).toBe('Dịch vụ tiện ích');
    });
  });

  describe('Radar Screen header resolution', () => {
    it('displays exact service name from searchParams (e.g. Chăm sóc mẹ và em bé) instead of Dịch vụ tiện ích', async () => {
      mockSearchParams = {
        requestId: 'REQ-20261105-UHCM',
        serviceName: 'Chăm sóc mẹ và em bé',
      };

      jest.spyOn(OrdersApi, 'getRequestDetail').mockResolvedValue({
        statusCode: 200,
        message: 'OK',
        data: {
          id: 'REQ-20261105-UHCM',
          requestCode: 'REQ-20261105-UHCM',
          customerUserId: 'cust-1',
          serviceId: 'cham-soc-me-be',
          description: 'Cần hỗ trợ chăm sóc mẹ và em bé sau sinh',
          status: 'open_for_bidding',
          addressText: '123 Nguyễn Lương Bằng, Đà Nẵng',
          latitude: 16.0748,
          longitude: 108.1499,
          createdAt: new Date().toISOString(),
          media: [],
        } as any,
      });

      render(<CustomerBookingRadarScreen />);

      await waitFor(() => {
        expect(screen.getByText('Chăm sóc mẹ và em bé')).toBeTruthy();
        expect(screen.queryByText('Dịch vụ tiện ích')).toBeNull();
      });
    });

    it('resolves service name from server request data when opened via requestId only', async () => {
      mockSearchParams = {
        requestId: 'REQ-20261105-UHCM',
      };

      jest.spyOn(OrdersApi, 'getRequestDetail').mockResolvedValue({
        statusCode: 200,
        message: 'OK',
        data: {
          id: 'REQ-20261105-UHCM',
          requestCode: 'REQ-20261105-UHCM',
          customerUserId: 'cust-1',
          serviceId: 'cham-soc-me-be',
          service: {
            id: 'cham-soc-me-be',
            name: 'Chăm sóc mẹ và em bé',
          },
          description: 'Tôi cần người Chăm sóc mẹ và em bé',
          status: 'open_for_bidding',
          addressText: '123 Nguyễn Lương Bằng, Đà Nẵng',
          latitude: 16.0748,
          longitude: 108.1499,
          createdAt: new Date().toISOString(),
          media: [],
        } as any,
      });

      render(<CustomerBookingRadarScreen />);

      await waitFor(() => {
        expect(screen.getByText('Chăm sóc mẹ và em bé')).toBeTruthy();
        expect(screen.queryByText('Dịch vụ tiện ích')).toBeNull();
      });
    });
  });
});
