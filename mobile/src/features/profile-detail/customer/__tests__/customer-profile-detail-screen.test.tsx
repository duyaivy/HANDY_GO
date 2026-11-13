import * as React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import { AuthApi } from '@/services/auth/auth-api';
import { useAuthStore } from '@/stores/use-auth-store';
import { CustomerProfileDetailScreen } from '../screens/customer-profile-detail-screen';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockCanGoBack = true;

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
    push: mockPush,
    canGoBack: () => mockCanGoBack,
  }),
}));

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
  mockCanGoBack = true;
  useAuthStore.setState({
    user: null,
    activeMode: null,
    isAuthenticated: false,
    isHydrated: true,
    isLoading: false,
    error: null,
    hydrationError: null,
  });
});

describe('customerProfileDetailScreen', () => {
  it('renders customer profile details matching worker profile screen style', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 'cust-999',
        phone: '0988888888',
        email: 'customer999@example.com',
        roles: ['Customer'],
        permissions: [],
      },
    });

    jest.spyOn(AuthApi, 'getMyProfile').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: {
        id: 'cust-999',
        fullName: 'Nguyễn Thị Khách',
        avatarUrl: 'https://example.com/avatar.jpg',
        status: 'active',
        customerProfile: null,
        workerProfile: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    render(<CustomerProfileDetailScreen />);

    // Header bar
    expect(screen.getByText('Thông tin hồ sơ')).toBeOnTheScreen();
    expect(screen.getByLabelText('Quay lại')).toBeOnTheScreen();

    // Profile details
    await waitFor(() => {
      expect(screen.getByTestId('profile-detail-name')).toHaveTextContent('Nguyễn Thị Khách');
      expect(screen.getByTestId('profile-detail-phone')).toHaveTextContent('0988888888');
      expect(screen.getByTestId('profile-detail-email')).toHaveTextContent('customer999@example.com');
      expect(screen.getByTestId('profile-detail-account-status-value')).toHaveTextContent('Đang hoạt động');
    });
  });

  it('navigates back when back button is pressed', async () => {
    render(<CustomerProfileDetailScreen />);

    fireEvent.press(screen.getByLabelText('Quay lại'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('calls onBack prop when provided', async () => {
    const onBackMock = jest.fn();
    render(<CustomerProfileDetailScreen onBack={onBackMock} />);

    fireEvent.press(screen.getByLabelText('Quay lại'));
    expect(onBackMock).toHaveBeenCalled();
  });

  it('renders error notice and retries on press', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 'cust-err',
        phone: '0911223344',
        email: 'cust-err@example.com',
        roles: ['Customer'],
        permissions: [],
      },
    });

    const getProfileSpy = jest
      .spyOn(AuthApi, 'getMyProfile')
      .mockRejectedValueOnce(new Error('Lỗi kết nối máy chủ'))
      .mockResolvedValueOnce({
        statusCode: 200,
        message: 'OK',
        data: {
          id: 'cust-err',
          fullName: 'Khách Tải Lại',
          avatarUrl: null,
          status: 'active',
          customerProfile: null,
          workerProfile: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

    render(<CustomerProfileDetailScreen />);

    expect(await screen.findByTestId('profile-detail-error')).toBeOnTheScreen();
    expect(screen.getByTestId('profile-detail-retry')).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('profile-detail-retry'));

    await waitFor(() => {
      expect(getProfileSpy).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId('profile-detail-name')).toHaveTextContent('Khách Tải Lại');
    });
  });
});
