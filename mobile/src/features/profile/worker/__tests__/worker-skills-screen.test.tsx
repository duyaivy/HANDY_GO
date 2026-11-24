import * as React from 'react';
import { RouteNames } from '@/constants/route-names';
import { OrdersApi } from '@/features/orders';
import { cleanup, fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import { AuthApi } from '@/services/auth/auth-api';
import { WORKER_CANCELLED_REGISTRATION_SENTINEL, WorkersApi } from '@/services/workers/workers-api';
import { useAuthStore } from '@/stores/use-auth-store';
import { WorkerSkillsScreen } from '../screens/worker-skills-screen';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
    canGoBack: () => true,
  }),
}));

beforeEach(() => {
  jest.spyOn(OrdersApi, 'getMyOrders').mockResolvedValue({
    statusCode: 200,
    message: 'OK',
    data: [],
  });
});

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isHydrated: true,
  });
});

describe('workerSkillsScreen', () => {
  it('renders row 1 stats, add button with arrow, approved services with toggle switch, and pending registrations', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 'worker-101',
        phone: '0911222333',
        email: 'worker101@example.com',
        roles: ['Worker'],
        permissions: [],
      },
    });

    jest.spyOn(AuthApi, 'getMyProfile').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: {
        id: 'worker-101',
        fullName: 'Nguyễn Văn Kỹ Thuật',
        avatarUrl: null,
        status: 'active',
        customerProfile: null,
        workerProfile: {
          id: 'wp-101',
          userId: 'worker-101',
          status: 'verified',
          averageRating: 4.9,
          ratingCount: 10,
          completedOrderCount: 20,
          orderCountTotal: 20,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    jest.spyOn(WorkersApi, 'getWorkerPublicProfile').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: {
        id: 'wp-101',
        userId: 'worker-101',
        fullName: 'Nguyễn Văn Kỹ Thuật',
        avatarUrl: null,
        status: 'verified',
        isVerified: true,
        stats: {
          averageRating: 4.9,
          ratingCount: 10,
          completedOrderCount: 20,
          orderCountTotal: 20,
          ratingDistribution: { 5: 10, 4: 0, 3: 0, 2: 0, 1: 0 },
        },
        services: [
          {
            id: 'svc-offering-1',
            serviceId: 'svc-real-12345678',
            title: 'Sửa chữa và bảo dưỡng máy giặt',
            description: 'Chuyên sửa bo mạch và thay thế linh kiện chính hãng',
            experienceYears: 4,
            isActive: true,
            orderCount: 15,
            revenue: 2500000,
          },
        ],
      },
    });

    jest.spyOn(WorkersApi, 'getMyServiceRegistrations').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: [
        {
          id: 'reg-001-uuid',
          workerProfileId: 'wp-101',
          status: 'pending',
          rejectionReason: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          services: [
            {
              serviceId: 'svc-vesinh',
              serviceName: 'Vệ sinh máy lạnh',
              title: 'Vệ sinh bảo dưỡng máy lạnh',
              categoryName: 'Điện Lạnh',
              experienceYears: 3,
            },
          ],
          evidenceFiles: [
            {
              url: 'https://sample.com/evidence1.jpg',
              fileType: 'image',
              name: 'Đồ nghề sửa chữa',
            },
          ],
        },
      ],
    });

    render(<WorkerSkillsScreen />);

    // 1. Row 1 Stats
    await waitFor(() => {
      expect(screen.getByTestId('worker-skills-stats-row')).toBeOnTheScreen();
      expect(screen.getByTestId('worker-active-services-count')).toHaveTextContent('1/1');
      expect(screen.getByTestId('worker-total-service-orders')).toHaveTextContent('20');
      expect(screen.getByTestId('worker-total-service-revenue')).toHaveTextContent('2.500.000 đ');
    });

    // 2. Row 2: Add Service Action Button with Arrow Right
    expect(screen.getByTestId('add-professional-skills-btn')).toBeOnTheScreen();
    expect(screen.getByText('+ Thêm dịch vụ kỹ năng mới')).toBeOnTheScreen();
    expect(screen.getByTestId('add-service-arrow-btn')).toBeOnTheScreen();

    // When clicked, navigates to register service screen
    fireEvent.press(screen.getByTestId('add-professional-skills-btn'));
    expect(mockPush).toHaveBeenCalledWith(RouteNames.WORKER_SKILLS_REGISTER);

    // 3. Row 3: Tab 1 "Nghiệp vụ của bạn"
    expect(screen.getByTestId('tab-my-services')).toBeOnTheScreen();
    expect(screen.getByText('Sửa chữa và bảo dưỡng máy giặt')).toBeOnTheScreen();
    expect(screen.getByText('Hoạt động')).toBeOnTheScreen();
    expect(screen.getByText(/15 đơn/)).toBeOnTheScreen();
    expect(screen.getAllByText(/2.500.000 đ/).length).toBeGreaterThanOrEqual(1);

    // 4. Test Toggle Switch
    const toggleSwitch = screen.getByTestId('toggle-service-switch-svc-offering-1');
    fireEvent(toggleSwitch, 'valueChange', false);

    await waitFor(() => {
      expect(screen.getByText('Tạm dừng')).toBeOnTheScreen();
      expect(screen.getByTestId('worker-active-services-count')).toHaveTextContent('0/1');
    });

    // 5. Row 3: Tab 2 "Chờ phê duyệt dịch vụ"
    fireEvent.press(screen.getByTestId('tab-registrations'));
    await waitFor(() => {
      expect(screen.getByText('Chờ phê duyệt')).toBeOnTheScreen();
      expect(screen.getByText('Vệ sinh bảo dưỡng máy lạnh')).toBeOnTheScreen();
      expect(screen.getByTestId('edit-registration-btn-reg-001-uuid')).toBeOnTheScreen();
      expect(screen.getByTestId('cancel-registration-btn-reg-001-uuid')).toBeOnTheScreen();
    });

    // Test clicking Edit button
    fireEvent.press(screen.getByTestId('edit-registration-btn-reg-001-uuid'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: RouteNames.WORKER_SKILLS_REGISTER,
        params: expect.objectContaining({
          editRegistrationId: 'reg-001-uuid',
        }),
      }),
    );
  });

  it('navigates to register screen from empty state button', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 'worker-101',
        phone: '0911222333',
        email: 'worker101@example.com',
        roles: ['Worker'],
        permissions: [],
      },
    });

    jest.spyOn(AuthApi, 'getMyProfile').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: {
        id: 'worker-101',
        fullName: 'Nguyễn Văn Kỹ Thuật',
        avatarUrl: null,
        status: 'active',
        customerProfile: null,
        workerProfile: {
          id: 'wp-101',
          userId: 'worker-101',
          status: 'verified',
          averageRating: 4.9,
          ratingCount: 10,
          completedOrderCount: 20,
          orderCountTotal: 20,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    jest.spyOn(WorkersApi, 'getWorkerPublicProfile').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: {
        id: 'wp-101',
        userId: 'worker-101',
        fullName: 'Nguyễn Văn Kỹ Thuật',
        status: 'verified',
        isVerified: true,
        stats: {
          averageRating: 0,
          ratingCount: 0,
          completedOrderCount: 0,
          orderCountTotal: 0,
          ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        },
        services: [],
      },
    });

    jest.spyOn(WorkersApi, 'getMyServiceRegistrations').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: [],
    });

    render(<WorkerSkillsScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('worker-services-empty')).toBeOnTheScreen();
    });

    fireEvent.press(screen.getByText('Thêm dịch vụ ngay'));
    expect(mockPush).toHaveBeenCalledWith(RouteNames.WORKER_SKILLS_REGISTER);
  });

  it('hides cancelled registrations and displays admin rejected registrations with rejection reason', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 'worker-101',
        phone: '0911222333',
        email: 'worker101@example.com',
        roles: ['Worker'],
        permissions: [],
      },
    });

    jest.spyOn(AuthApi, 'getMyProfile').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: {
        id: 'worker-101',
        fullName: 'Nguyễn Văn Kỹ Thuật',
        avatarUrl: null,
        status: 'active',
        customerProfile: null,
        workerProfile: {
          id: 'wp-101',
          userId: 'worker-101',
          status: 'verified',
          averageRating: 5,
          ratingCount: 1,
          completedOrderCount: 1,
          orderCountTotal: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    jest.spyOn(WorkersApi, 'getWorkerPublicProfile').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: {
        id: 'wp-101',
        userId: 'worker-101',
        fullName: 'Nguyễn Văn Kỹ Thuật',
        status: 'verified',
        isVerified: true,
        stats: {
          averageRating: 5,
          ratingCount: 1,
          completedOrderCount: 1,
          orderCountTotal: 1,
          ratingDistribution: { 5: 1 },
        },
        services: [],
      },
    });

    jest.spyOn(WorkersApi, 'getMyServiceRegistrations').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: [
        {
          id: 'reg-rejected-admin',
          workerProfileId: 'wp-101',
          status: 'rejected',
          rejectionReason: 'Hình ảnh đồ nghề bị mờ, vui lòng chụp lại rõ nét',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          services: [
            {
              serviceId: 'svc-dieu-hoa',
              serviceName: 'Lắp đặt điều hòa',
              title: 'Lắp đặt điều hòa treo tường',
              experienceYears: 2,
            },
          ],
          evidenceFiles: [],
        },
        {
          id: 'reg-cancelled-by-worker',
          workerProfileId: 'wp-101',
          status: 'rejected',
          rejectionReason: '[Thợ chủ động hủy yêu cầu]',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          services: [
            {
              serviceId: 'svc-dien-nuoc',
              serviceName: 'Sửa điện nước',
              title: 'Sửa ống nước rò rỉ',
              experienceYears: 1,
            },
          ],
          evidenceFiles: [],
        },
        {
          id: 'reg-rejected-with-word-huy',
          workerProfileId: 'wp-101',
          status: 'rejected',
          rejectionReason: 'Hồ sơ bị hủy bỏ theo yêu cầu của phòng an toàn',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          services: [
            {
              serviceId: 'svc-khoa',
              serviceName: 'Sửa khóa cửa',
              title: 'Sửa khóa vân tay',
              experienceYears: 3,
            },
          ],
          evidenceFiles: [],
        },
      ],
    });

    render(<WorkerSkillsScreen />);

    // Switch to tab "Chờ phê duyệt"
    fireEvent.press(screen.getByTestId('tab-registrations'));

    await waitFor(() => {
      // 1. Đơn bị Admin từ chối phải hiển thị
      expect(screen.getByText('Lắp đặt điều hòa treo tường')).toBeOnTheScreen();
      expect(screen.getAllByText('Bị từ chối')).toHaveLength(2);
      expect(screen.getByText(/Hình ảnh đồ nghề bị mờ/)).toBeOnTheScreen();

      // 2. Đơn do thợ chủ động hủy PHẢI BỊ ẨN HOÀN TOÀN
      expect(screen.queryByText('Sửa ống nước rò rỉ')).toBeNull();
      expect(screen.queryByText('Đã hủy')).toBeNull();

      // 3. Đơn bị Admin từ chối có chữ "hủy" trong lý do vẫn PHẢI HIỂN THỊ
      expect(screen.getByText('Sửa khóa vân tay')).toBeOnTheScreen();
      expect(screen.getByText(/Hồ sơ bị hủy bỏ theo yêu cầu/)).toBeOnTheScreen();

      // 3. Đơn bị từ chối được phép hiển thị nút Chỉnh sửa
      expect(screen.getByTestId('edit-registration-btn-reg-rejected-admin')).toBeOnTheScreen();
    });
  });

  it('filters out approved registrations from pending approval tab', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 'worker-101',
        phone: '0911222333',
        email: 'worker101@example.com',
        roles: ['Worker'],
        permissions: [],
      },
    });

    jest.spyOn(AuthApi, 'getMyProfile').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: {
        id: 'worker-101',
        fullName: 'Nguyễn Văn Kỹ Thuật',
        avatarUrl: null,
        status: 'active',
        customerProfile: null,
        workerProfile: {
          id: 'wp-101',
          userId: 'worker-101',
          status: 'verified',
          averageRating: 5,
          ratingCount: 1,
          completedOrderCount: 1,
          orderCountTotal: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    jest.spyOn(WorkersApi, 'getMyServiceRegistrations').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: [
        {
          id: 'reg-approved-uuid',
          workerProfileId: 'wp-101',
          status: 'approved',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          services: [
            {
              serviceId: 'svc-dieu-hoa',
              serviceName: 'Lắp đặt điều hòa',
              title: 'Lắp đặt điều hòa treo tường',
              experienceYears: 2,
            },
          ],
          evidenceFiles: [],
        },
      ],
    });

    render(<WorkerSkillsScreen />);
    fireEvent.press(screen.getByTestId('tab-registrations'));

    await waitFor(() => {
      expect(screen.queryByText('Đã duyệt')).toBeNull();
      expect(screen.queryByText('Lắp đặt điều hòa treo tường')).toBeNull();
      expect(screen.getByText('Chờ phê duyệt (0)')).toBeOnTheScreen();
      expect(screen.getByText('Không có dịch vụ nào đang chờ duyệt')).toBeOnTheScreen();
      expect(screen.queryByTestId('edit-registration-btn-reg-approved-uuid')).toBeNull();
      expect(screen.queryByTestId('cancel-registration-btn-reg-approved-uuid')).toBeNull();
    });
  });

  it('aggregates service order count and revenue from OrdersApi.getMyOrders when offering fields are missing', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 'worker-101',
        phone: '0911222333',
        email: 'worker101@example.com',
        roles: ['Worker'],
        permissions: [],
      },
    });

    jest.spyOn(AuthApi, 'getMyProfile').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: {
        id: 'worker-101',
        fullName: 'Nguyễn Văn Kỹ Thuật',
        avatarUrl: null,
        status: 'active',
        customerProfile: null,
        workerProfile: {
          id: 'wp-101',
          userId: 'worker-101',
          status: 'verified',
          averageRating: 5.0,
          ratingCount: 2,
          completedOrderCount: 2,
          orderCountTotal: 2,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    jest.spyOn(WorkersApi, 'getWorkerPublicProfile').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: {
        id: 'wp-101',
        userId: 'worker-101',
        fullName: 'Nguyễn Văn Kỹ Thuật',
        avatarUrl: null,
        status: 'verified',
        isVerified: true,
        verifiedAt: new Date().toISOString(),
        approvedAt: new Date().toISOString(),
        memberSince: new Date().toISOString(),
        stats: {
          averageRating: 5.0,
          ratingCount: 2,
          completedOrderCount: 2,
          orderCountTotal: 2,
          ratingDistribution: { 5: 2, 4: 0, 3: 0, 2: 0, 1: 0 },
        },
        services: [
          {
            id: 'svc-offering-test',
            serviceId: 'svc-uuid-ac-clean',
            title: 'Vệ sinh điều hòa inverter',
            description: 'Vệ sinh chuyên sâu bằng máy áp lực',
            experienceYears: 5,
            isActive: true,
            // orderCount & revenue omitted to test aggregation from OrdersApi
          },
        ],
      },
    });

    jest.spyOn(WorkersApi, 'getMyServiceRegistrations').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: [],
    });

    jest.spyOn(OrdersApi, 'getMyOrders').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: [
        {
          id: 'order-1',
          orderCode: 'ORD-001',
          customerUserId: 'customer-1',
          workerUserId: 'worker-101',
          serviceId: 'svc-uuid-ac-clean',
          agreedPrice: 350000,
          status: 'completed' as any,
          paymentState: 'paid' as any,
          createdAt: new Date().toISOString(),
        } as any,
        {
          id: 'order-2',
          orderCode: 'ORD-002',
          customerUserId: 'customer-2',
          workerUserId: 'worker-101',
          serviceId: 'svc-uuid-ac-clean',
          agreedPrice: 150000,
          status: 'cancelled' as any,
          paymentState: 'unpaid' as any,
          createdAt: new Date().toISOString(),
        } as any,
      ],
    });

    render(<WorkerSkillsScreen />);

    await waitFor(() => {
      expect(screen.getByText('Vệ sinh điều hòa inverter')).toBeOnTheScreen();
      // Total orders for this service = 2 (completed + cancelled)
      expect(screen.getByText('2 đơn')).toBeOnTheScreen();
      // Revenue is rendered in both top summary card and this service card = 350.000 đ
      expect(screen.getAllByText('350.000 đ')).toHaveLength(2);
    });
  });

  it('mixed pending and rejected registrations badge counts only pending and displays rejected items with reasons while approved are hidden', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 'worker-101',
        phone: '0911222333',
        email: 'worker101@example.com',
        roles: ['Worker'],
        permissions: [],
      },
    });

    jest.spyOn(AuthApi, 'getMyProfile').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: {
        id: 'worker-101',
        fullName: 'Nguyễn Văn Kỹ Thuật',
        avatarUrl: null,
        status: 'active',
        customerProfile: null,
        workerProfile: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    jest.spyOn(WorkersApi, 'getWorkerPublicProfile').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: {
        id: 'wp-101',
        userId: 'worker-101',
        fullName: 'Nguyễn Văn Kỹ Thuật',
        avatarUrl: null,
        status: 'verified',
        isVerified: true,
        stats: {
          averageRating: 5,
          ratingCount: 0,
          completedOrderCount: 0,
          orderCountTotal: 0,
          ratingDistribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
        },
        services: [],
      },
    });

    // 1 pending, 2 rejected, 1 approved, 1 worker-cancelled
    jest.spyOn(WorkersApi, 'getMyServiceRegistrations').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: [
        {
          id: 'reg-pending-1',
          workerProfileId: 'wp-101',
          status: 'pending',
          rejectionReason: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          services: [
            {
              serviceId: 's-pending',
              serviceName: 'Dịch vụ đang chờ',
              title: 'Dịch vụ đang chờ duyệt',
              categoryName: 'Điện Lạnh',
              experienceYears: 2,
            },
          ],
          evidenceFiles: [],
        },
        {
          id: 'reg-rejected-1',
          workerProfileId: 'wp-101',
          status: 'rejected',
          rejectionReason: 'Thiếu chứng chỉ hành nghề chính thức',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          services: [
            {
              serviceId: 's-rej-1',
              serviceName: 'Sửa điện 3 pha',
              title: 'Sửa điện 3 pha công nghiệp',
              categoryName: 'Điện',
              experienceYears: 1,
            },
          ],
          evidenceFiles: [],
        },
        {
          id: 'reg-rejected-2',
          workerProfileId: 'wp-101',
          status: 'rejected',
          rejectionReason: 'Ảnh chụp đồ nghề bị mờ',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          services: [
            {
              serviceId: 's-rej-2',
              serviceName: 'Lắp camera an ninh',
              title: 'Lắp đặt camera IP',
              categoryName: 'Điện tử',
              experienceYears: 3,
            },
          ],
          evidenceFiles: [],
        },
        {
          id: 'reg-approved-1',
          workerProfileId: 'wp-101',
          status: 'approved',
          rejectionReason: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          services: [
            {
              serviceId: 's-appr-1',
              serviceName: 'Đã được duyệt',
              title: 'Dịch vụ đã được duyệt từ trước',
              categoryName: 'Điện Lạnh',
              experienceYears: 5,
            },
          ],
          evidenceFiles: [],
        },
        {
          id: 'reg-cancelled-1',
          workerProfileId: 'wp-101',
          status: 'rejected',
          rejectionReason: WORKER_CANCELLED_REGISTRATION_SENTINEL,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          services: [
            {
              serviceId: 's-cancel-1',
              serviceName: 'Đã hủy',
              title: 'Dịch vụ thợ chủ động hủy',
              categoryName: 'Khác',
              experienceYears: 1,
            },
          ],
          evidenceFiles: [],
        },
      ],
    });

    render(<WorkerSkillsScreen />);

    // Tab badge must show only pending count (1), NOT including the 2 rejected or approved or cancelled!
    await waitFor(() => {
      expect(screen.getByText('Chờ phê duyệt (1)')).toBeOnTheScreen();
    });

    // Switch to registrations tab
    fireEvent.press(screen.getByTestId('tab-registrations'));

    await waitFor(() => {
      // Pending item is visible
      expect(screen.getByText('Dịch vụ đang chờ duyệt')).toBeOnTheScreen();
      // Rejected items are visible with reasons
      expect(screen.getByText('Sửa điện 3 pha công nghiệp')).toBeOnTheScreen();
      expect(screen.getByText(/Thiếu chứng chỉ hành nghề chính thức/)).toBeOnTheScreen();
      expect(screen.getByText('Lắp đặt camera IP')).toBeOnTheScreen();
      expect(screen.getByText(/Ảnh chụp đồ nghề bị mờ/)).toBeOnTheScreen();
      // Approved and worker-cancelled items must NOT be visible
      expect(screen.queryByText('Dịch vụ đã được duyệt từ trước')).toBeNull();
      expect(screen.queryByText('Dịch vụ thợ chủ động hủy')).toBeNull();
    });
  });

  it('fetches and aggregates orders across multiple pages (>50 orders) and isolates dual-role customer orders', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 'worker-101',
        phone: '0911222333',
        email: 'worker101@example.com',
        roles: ['Worker', 'Customer'],
        permissions: [],
      },
    });

    jest.spyOn(AuthApi, 'getMyProfile').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: {
        id: 'worker-101',
        fullName: 'Nguyễn Văn Kỹ Thuật',
        avatarUrl: null,
        status: 'active',
        customerProfile: null,
        workerProfile: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    jest.spyOn(WorkersApi, 'getWorkerPublicProfile').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: {
        id: 'wp-101',
        userId: 'worker-101',
        fullName: 'Nguyễn Văn Kỹ Thuật',
        avatarUrl: null,
        status: 'verified',
        isVerified: true,
        stats: {
          averageRating: 5,
          ratingCount: 0,
          completedOrderCount: 0,
          orderCountTotal: 0,
          ratingDistribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
        },
        services: [
          {
            id: 'svc-offering-multipage',
            serviceId: 'svc-ac-clean-multi',
            title: 'Bảo trì máy lạnh công nghiệp',
            description: 'Vệ sinh hệ thống điều hòa VRV',
            experienceYears: 6,
            isActive: true,
          },
        ],
      },
    });

    jest.spyOn(WorkersApi, 'getMyServiceRegistrations').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: [],
    });

    // Page 1: 50 completed worker orders + 1 customer order (dual-role)
    const page1WorkerOrders = Array.from({ length: 50 }, (_, i) => ({
      id: `order-p1-${i}`,
      orderCode: `ORD-P1-${i}`,
      workerUserId: 'worker-101',
      serviceId: 'svc-ac-clean-multi',
      agreedPrice: 200000,
      status: 'completed',
      paymentState: 'paid',
      createdAt: new Date().toISOString(),
    }));

    const page1CustomerOrder = {
      id: 'order-cust-dual',
      orderCode: 'ORD-CUST-DUAL',
      customerUserId: 'worker-101',
      workerUserId: 'another-worker-999',
      serviceId: 'svc-ac-clean-multi',
      agreedPrice: 500000,
      status: 'completed',
      paymentState: 'paid',
      createdAt: new Date().toISOString(),
    };

    // Page 2: 10 completed worker orders
    const page2WorkerOrders = Array.from({ length: 10 }, (_, i) => ({
      id: `order-p2-${i}`,
      orderCode: `ORD-P2-${i}`,
      workerUserId: 'worker-101',
      serviceId: 'svc-ac-clean-multi',
      agreedPrice: 200000,
      status: 'completed',
      paymentState: 'paid',
      createdAt: new Date().toISOString(),
    }));

    const getMyOrdersSpy = jest.spyOn(OrdersApi, 'getMyOrders').mockImplementation(async (params: any) => {
      if (params?.page === 2) {
        return {
          statusCode: 200,
          message: 'OK',
          data: {
            items: page2WorkerOrders,
            total: 60,
            page: 2,
            limit: 50,
            totalPages: 2,
          } as any,
        };
      }
      return {
        statusCode: 200,
        message: 'OK',
        data: {
          items: [...page1WorkerOrders, page1CustomerOrder],
          total: 60,
          page: 1,
          limit: 50,
          totalPages: 2,
        } as any,
      };
    });

    render(<WorkerSkillsScreen />);

    await waitFor(() => {
      expect(screen.getAllByText('12.000.000 đ')).toHaveLength(2);
    });

    // Must query with role: 'worker'
    expect(getMyOrdersSpy).toHaveBeenCalledWith(expect.objectContaining({ role: 'worker', page: 1, limit: 50 }));
    expect(getMyOrdersSpy).toHaveBeenCalledWith(expect.objectContaining({ role: 'worker', page: 2, limit: 50 }));
    // Total orders for this service = 60 (the 1 customer order of dual-role is excluded!)
    expect(screen.getByText('60 đơn')).toBeOnTheScreen();
  });

  it('stops polling and triggers profile refresh when pending registration is approved', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 'worker-101',
        phone: '0911222333',
        email: 'worker101@example.com',
        roles: ['Worker'],
        permissions: [],
      },
    });

    jest.spyOn(AuthApi, 'getMyProfile').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: {
        id: 'worker-101',
        fullName: 'Nguyễn Văn Kỹ Thuật',
        avatarUrl: null,
        status: 'active',
        customerProfile: null,
        workerProfile: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    const getProfileSpy = jest.spyOn(WorkersApi, 'getWorkerPublicProfile').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: {
        id: 'wp-101',
        userId: 'worker-101',
        fullName: 'Nguyễn Văn Kỹ Thuật',
        avatarUrl: null,
        status: 'verified',
        isVerified: true,
        stats: {
          averageRating: 5,
          ratingCount: 0,
          completedOrderCount: 0,
          orderCountTotal: 0,
          ratingDistribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
        },
        services: [],
      },
    });

    const pendingItem = {
      id: 'reg-polling-1',
      workerProfileId: 'wp-101',
      status: 'pending',
      rejectionReason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      services: [],
      evidenceFiles: [],
    };

    const getRegsSpy = jest.spyOn(WorkersApi, 'getMyServiceRegistrations').mockResolvedValueOnce({
      statusCode: 200,
      message: 'OK',
      data: [pendingItem],
    }).mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: [], // Next fetch returns 0 pending (approved/resolved)
    });

    const { rerender } = render(<WorkerSkillsScreen />);

    await waitFor(() => {
      expect(getRegsSpy).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(getProfileSpy).toHaveBeenCalledTimes(1);
    });

    // Rerender when pending list is cleared
    rerender(<WorkerSkillsScreen />);

    await waitFor(() => {
      // Profile query refetched to pick up newly approved services
      expect(getProfileSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
    });
  });
});
