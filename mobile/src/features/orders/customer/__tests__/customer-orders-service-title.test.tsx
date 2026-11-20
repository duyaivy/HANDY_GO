import * as React from 'react';
import { cleanup, fireEvent, render, screen } from '@/lib/test-utils';
import { useAuthStore } from '@/stores/use-auth-store';
import { CustomerOrdersScreen } from '../screens/customer-orders-screen';

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: mockPush,
    replace: jest.fn(),
    back: mockBack,
  })),
  useLocalSearchParams: jest.fn(() => ({ tab: 'Searching' })),
}));

let mockOrdersData: any[] = [];
let mockRequestsData: any[] = [];

jest.mock('../../hooks/use-customer-orders', () => ({
  useCustomerOrders: jest.fn(() => ({
    orders: mockOrdersData,
    requests: mockRequestsData,
    isLoading: false,
    isRefetching: false,
    refetch: jest.fn(),
  })),
}));

const initialAuthState = useAuthStore.getState();

afterEach(() => {
  cleanup();
  useAuthStore.setState(initialAuthState, true);
  mockOrdersData = [];
  mockRequestsData = [];
  jest.clearAllMocks();
});

describe('CustomerOrdersScreen - Service Title Resolution & Defensive Shielding', () => {
  it('displays known service name when serviceId is in KNOWN_SERVICES_BY_ID', () => {
    useAuthStore.setState({ isAuthenticated: true });
    mockRequestsData = [
      {
        id: 'req-1',
        requestCode: 'REQ-20261119-MTJF',
        serviceId: 'a34626a6-fbe8-44fe-9ceb-33e85285b0e8', // Sửa điện
        description: 'Sự cố chập điện phòng khách',
        status: 'open_for_bidding',
        addressText: '992 Hà Huy Tập',
        createdAt: '2026-11-19T08:00:00Z',
      },
    ];

    render(<CustomerOrdersScreen />);

    expect(screen.getByText('Sửa điện')).toBeOnTheScreen();
  });

  it('displays Bốc xếp hàng hoá for srv-boc-xep alias', () => {
    useAuthStore.setState({ isAuthenticated: true });
    mockRequestsData = [
      {
        id: 'req-bx',
        requestCode: 'REQ-20261119-BX01',
        serviceId: 'srv-boc-xep',
        description: 'Chuyển nhà chung cư',
        status: 'open_for_bidding',
        addressText: '123 Nguyễn Lương Bằng',
        createdAt: '2026-11-19T08:00:00Z',
      },
    ];

    render(<CustomerOrdersScreen />);

    expect(screen.getByText('Bốc xếp hàng hoá')).toBeOnTheScreen();
  });

  it('extracts service name from prefixed description with chip details', () => {
    useAuthStore.setState({ isAuthenticated: true });
    mockRequestsData = [
      {
        id: 'req-prefix',
        requestCode: 'REQ-20261119-XQAB',
        serviceId: 'dynamic-unmapped-uuid',
        description: 'Tôi cần người Bốc xếp hàng hoá: Sự cố: Rò rỉ nước - Vị trí: Nhà tắm - Mức độ: Nặng (ngập/nguy hiểm). Cần thợ kiểm tra và xử lý sớm.',
        status: 'open_for_bidding',
        addressText: '992 Hà Huy Tập',
        createdAt: '2026-11-19T08:00:00Z',
      },
    ];

    render(<CustomerOrdersScreen />);

    // Must extract "Bốc xếp hàng hoá", NOT the incident details
    expect(screen.getByText('Bốc xếp hàng hoá')).toBeOnTheScreen();
    expect(screen.queryByText(/Sự cố: Rò rỉ nước/)).toBeNull();
  });

  it('extracts service name from prefixed description with clean chip details (no trailing suffix)', () => {
    useAuthStore.setState({ isAuthenticated: true });
    mockRequestsData = [
      {
        id: 'req-clean-chips',
        requestCode: 'REQ-20261119-CLEAN',
        serviceId: 'dynamic-unmapped-uuid',
        description: 'Tôi cần người Bốc xếp hàng hoá: Sự cố: Rò rỉ nước - Vị trí: Nhà tắm',
        status: 'open_for_bidding',
        addressText: '992 Hà Huy Tập',
        createdAt: '2026-11-19T08:00:00Z',
      },
    ];

    render(<CustomerOrdersScreen />);

    expect(screen.getByText('Bốc xếp hàng hoá')).toBeOnTheScreen();
    expect(screen.queryByText(/Sự cố: Rò rỉ nước/)).toBeNull();
  });

  it('shields card title against raw incident description leakage and infers service from keywords', () => {
    useAuthStore.setState({ isAuthenticated: true });
    mockRequestsData = [
      {
        id: 'req-old',
        requestCode: 'REQ-20261119-OLD1',
        serviceId: 'unmapped-uuid',
        // Legacy request that only contains incident chips without service prefix
        description: 'Sự cố: Rò rỉ nước - Vị trí: Nhà tắm - Mức độ: Nặng (ngập/nguy hiểm). Cần thợ kiểm tra và xử lý sớm.',
        status: 'open_for_bidding',
        addressText: '992 Hà Huy Tập',
        createdAt: '2026-11-19T08:00:00Z',
      },
    ];

    render(<CustomerOrdersScreen />);

    // Due to keyword 'rò rỉ nước', resolves to 'Sửa ống nước', never leaks the raw string
    expect(screen.getByText('Sửa ống nước')).toBeOnTheScreen();
    expect(screen.queryByText(/Sự cố: Rò rỉ nước/)).toBeNull();
  });

  it('falls back to safe generic title when incident description has no matching keywords', () => {
    useAuthStore.setState({ isAuthenticated: true });
    mockRequestsData = [
      {
        id: 'req-unknown-incident',
        requestCode: 'REQ-20261119-UNK1',
        serviceId: 'unmapped-uuid-xyz',
        description: 'Sự cố: Thiết bị lạ - Vị trí: Tầng lầu. Cần thợ kiểm tra và xử lý sớm.',
        status: 'open_for_bidding',
        addressText: '992 Hà Huy Tập',
        createdAt: '2026-11-19T08:00:00Z',
      },
    ];

    render(<CustomerOrdersScreen />);

    expect(screen.getByText('Dịch vụ sửa chữa tại nhà')).toBeOnTheScreen();
    expect(screen.queryByText(/Sự cố: Thiết bị lạ/)).toBeNull();
  });

  it('renders order card with resolved service name instead of raw "Dịch vụ đã trao đổi"', () => {
    useAuthStore.setState({ isAuthenticated: true });
    mockOrdersData = [
      {
        id: 'ord-1',
        orderCode: 'ORD-20261119-8LEK',
        serviceId: 'srv-care-mom-baby',
        agreedScope: 'Dịch vụ đã trao đổi',
        agreedPrice: 300000,
        addressText: 'Đường Hà Huy Tập',
        status: 'in_progress',
        paymentState: 'unpaid',
        createdAt: '2026-11-19T08:00:00Z',
      },
    ];

    // Select "Đang làm" tab
    render(<CustomerOrdersScreen />);
    const inProcessTab = screen.getByTestId('activity-filter-tab-in-process');
    fireEvent.press(inProcessTab);

    expect(screen.getByText('Chăm sóc mẹ và em bé')).toBeOnTheScreen();
    expect(screen.queryByText('Dịch vụ đã trao đổi')).toBeNull();
  });
});
