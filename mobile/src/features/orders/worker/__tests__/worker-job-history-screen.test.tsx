import * as React from 'react';
import { cleanup, fireEvent, render, screen } from '@/lib/test-utils';
import { WorkerJobHistoryScreen } from '../screens/worker-job-history-screen';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockRefetch = jest.fn();
const mockFetchNextPage = jest.fn();

const mockWorkerOrders = [
  {
    id: 'job-comp-1',
    orderCode: 'HDG-2001',
    serviceId: 'srv-01',
    agreedPrice: 350000,
    agreedScope: 'Sửa đường ống nước',
    addressText: '150 Hùng Vương, Đà Nẵng',
    status: 'completed',
    completedAt: '2026-11-21T11:00:00.000Z',
    createdAt: '2026-11-21T09:00:00.000Z',
  },
  {
    id: 'job-canc-1',
    orderCode: 'HDG-2002',
    serviceId: 'srv-ac',
    agreedPrice: 500000,
    agreedScope: 'Bảo dưỡng điều hòa',
    addressText: '88 Nguyễn Văn Thoại, Đà Nẵng',
    status: 'cancelled',
    cancelReason: 'Thời tiết xấu',
    cancelledAt: '2026-11-20T16:00:00.000Z',
    createdAt: '2026-11-20T15:00:00.000Z',
  },
];

let mockHookReturn: any = {
  orders: mockWorkerOrders,
  stats: {
    completedCount: 1,
    cancelledCount: 1,
    totalEarnings: 350000,
  },
  isLoading: false,
  isError: false,
  refetch: mockRefetch,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: mockFetchNextPage,
};

const mockHookFn = jest.fn((..._args: any[]) => mockHookReturn);

jest.mock('../../hooks/use-worker-job-history', () => ({
  useWorkerJobHistory: (...args: any[]) => mockHookFn(...args),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: mockBack,
  }),
}));

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
  mockHookReturn = {
    orders: mockWorkerOrders,
    stats: {
      completedCount: 1,
      cancelledCount: 1,
      totalEarnings: 350000,
    },
    isLoading: false,
    isError: false,
    refetch: mockRefetch,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: mockFetchNextPage,
  };
});

describe('workerJobHistoryScreen', () => {
  it('renders app bar, performance overview stats, tabs and job cards', () => {
    render(<WorkerJobHistoryScreen />);

    expect(screen.getByText('Lịch sử công việc')).toBeOnTheScreen();
    expect(screen.getByTestId('worker-job-history-app-bar')).toBeOnTheScreen();
    expect(screen.getByText('Tổng quan hiệu suất')).toBeOnTheScreen();
    expect(screen.getByTestId('worker-history-completed-count')).toHaveTextContent('1 việc');
    expect(screen.getByTestId('worker-history-cancelled-count')).toHaveTextContent('1 việc');

    // Check tabs
    expect(screen.getByTestId('worker-history-tab-all')).toBeOnTheScreen();
    expect(screen.getByTestId('worker-history-tab-completed')).toBeOnTheScreen();
    expect(screen.getByTestId('worker-history-tab-cancelled')).toBeOnTheScreen();

    // Check job cards
    expect(screen.getByTestId('worker-history-card-job-comp-1')).toBeOnTheScreen();
    expect(screen.getByTestId('worker-history-card-job-canc-1')).toBeOnTheScreen();
  });

  it('navigates to job detail when pressing "Xem chi tiết"', () => {
    render(<WorkerJobHistoryScreen />);

    fireEvent.press(screen.getByTestId('worker-job-detail-btn-job-comp-1'));
    expect(mockPush).toHaveBeenCalledWith('/worker/jobs/job-comp-1');
  });

  it('renders empty state when there are no jobs in history', () => {
    mockHookReturn = {
      orders: [],
      stats: {
        completedCount: 0,
        cancelledCount: 0,
        totalEarnings: 0,
      },
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: mockFetchNextPage,
    };

    render(<WorkerJobHistoryScreen />);

    expect(screen.getByTestId('worker-history-empty-state')).toBeOnTheScreen();
    expect(screen.getByText('Chưa có công việc nào')).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('worker-history-find-jobs-btn'));
    expect(mockPush).toHaveBeenCalledWith('/worker/jobs');
  });

  it('triggers auto infinite scroll when scrolling close to bottom', () => {
    mockHookReturn = {
      orders: mockWorkerOrders,
      stats: {
        completedCount: 1,
        cancelledCount: 1,
        totalEarnings: 350000,
      },
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage: mockFetchNextPage,
    };

    render(<WorkerJobHistoryScreen />);

    const scrollView = screen.getByTestId('worker-history-scroll-view');
    fireEvent.scroll(scrollView, {
      nativeEvent: {
        contentOffset: { y: 600 },
        contentSize: { height: 1000, width: 400 },
        layoutMeasurement: { height: 500, width: 400 },
      },
    });

    expect(mockFetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('renders auto infinite loading indicator when isFetchingNextPage is true', () => {
    mockHookReturn = {
      orders: mockWorkerOrders,
      stats: {
        completedCount: 1,
        cancelledCount: 1,
        totalEarnings: 350000,
      },
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      hasNextPage: true,
      isFetchingNextPage: true,
      fetchNextPage: mockFetchNextPage,
    };

    render(<WorkerJobHistoryScreen />);

    expect(screen.getByTestId('worker-history-loading-more-indicator')).toBeOnTheScreen();
    expect(screen.getByText('Đang tải thêm công việc...')).toBeOnTheScreen();
  });

  it('filters worker jobs by search keyword and clears search when clear button is pressed', () => {
    render(<WorkerJobHistoryScreen />);

    const searchInput = screen.getByTestId('worker-history-search-input');
    fireEvent.changeText(searchInput, 'điều hòa');

    // Only job-canc-1 (Bảo dưỡng điều hòa) should remain
    expect(screen.getByTestId('worker-history-card-job-canc-1')).toBeOnTheScreen();
    expect(screen.queryByTestId('worker-history-card-job-comp-1')).toBeNull();

    // Clear search
    const clearBtn = screen.getByTestId('worker-clear-search-btn');
    fireEvent.press(clearBtn);

    // All jobs restored
    expect(screen.getByTestId('worker-history-card-job-comp-1')).toBeOnTheScreen();
    expect(screen.getByTestId('worker-history-card-job-canc-1')).toBeOnTheScreen();
  });

  it('shows search-empty-state when no jobs match keyword and clears search on button tap', () => {
    render(<WorkerJobHistoryScreen />);

    const searchInput = screen.getByTestId('worker-history-search-input');
    fireEvent.changeText(searchInput, 'từ khóa không tồn tại');

    expect(screen.getByTestId('worker-search-empty-state')).toBeOnTheScreen();
    expect(screen.getByText('Không tìm thấy kết quả')).toBeOnTheScreen();

    // Tap clear button in empty state
    fireEvent.press(screen.getByTestId('worker-clear-search-result-btn'));

    expect(screen.queryByTestId('worker-search-empty-state')).toBeNull();
    expect(screen.getByTestId('worker-history-card-job-comp-1')).toBeOnTheScreen();
  });

  it('renders cancelReason for cancelled jobs', () => {
    render(<WorkerJobHistoryScreen />);
    expect(screen.getByText('Lý do hủy: Thời tiết xấu')).toBeOnTheScreen();
  });

  it('renders search results count indicator during search', () => {
    render(<WorkerJobHistoryScreen />);
    const searchInput = screen.getByTestId('worker-history-search-input');
    fireEvent.changeText(searchInput, 'điều hòa');

    expect(screen.getByTestId('worker-search-results-count')).toBeOnTheScreen();
    expect(screen.getByText('Tìm thấy 1 công việc phù hợp')).toBeOnTheScreen();
  });

  it('renders error state when isError is true and calls refetch on retry tap', async () => {
    mockHookReturn = {
      orders: [],
      stats: {
        completedCount: 0,
        cancelledCount: 0,
        totalEarnings: 0,
      },
      isLoading: false,
      isError: true,
      refetch: mockRefetch,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: mockFetchNextPage,
    };

    render(<WorkerJobHistoryScreen />);

    expect(screen.getByTestId('worker-history-error-state')).toBeOnTheScreen();
    expect(screen.getByText('Không thể tải dữ liệu')).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('worker-history-retry-btn'));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('displays "Tổng giá trị đơn hoàn thành" and "Giá thỏa thuận" distinguishing gross vs net (HG-72 P1)', () => {
    render(<WorkerJobHistoryScreen />);

    // Top overview card gross label
    expect(screen.getByText('Tổng giá trị đơn hoàn thành')).toBeOnTheScreen();
    // Job card gross agreedPrice label
    expect(screen.getAllByText('Giá thỏa thuận').length).toBeGreaterThan(0);
    expect(screen.queryByText('Tiền công nhận')).toBeNull();
  });

  it('keeps stats stable across 3 tabs (all, completed, cancelled) and independent of pagination (HG-72 P1)', () => {
    render(<WorkerJobHistoryScreen />);

    // In 'all' tab
    expect(screen.getByTestId('worker-history-completed-count')).toHaveTextContent('1 việc');
    expect(screen.getByTestId('worker-history-cancelled-count')).toHaveTextContent('1 việc');

    // Switch to 'completed' tab: cancelled count must still be 1 (not 0)
    fireEvent.press(screen.getByTestId('worker-history-tab-completed'));
    expect(screen.getByTestId('worker-history-cancelled-count')).toHaveTextContent('1 việc');
    expect(screen.getByTestId('worker-history-completed-count')).toHaveTextContent('1 việc');

    // Switch to 'cancelled' tab: completed count and earnings must remain stable
    fireEvent.press(screen.getByTestId('worker-history-tab-cancelled'));
    expect(screen.getByTestId('worker-history-completed-count')).toHaveTextContent('1 việc');
    expect(screen.getByTestId('worker-history-cancelled-count')).toHaveTextContent('1 việc');
    expect(screen.getAllByText('350.000 đ').length).toBeGreaterThanOrEqual(1);
  });

  it('displays independent summary stats correctly with >10 orders (HG-72 P1)', () => {
    mockHookReturn = {
      orders: mockWorkerOrders,
      stats: {
        completedCount: 28,
        cancelledCount: 6,
        totalEarnings: 15400000,
      },
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage: mockFetchNextPage,
    };

    render(<WorkerJobHistoryScreen />);

    expect(screen.getByTestId('worker-history-completed-count')).toHaveTextContent('28 việc');
    expect(screen.getByTestId('worker-history-cancelled-count')).toHaveTextContent('6 việc');
    expect(screen.getByText('15.400.000 đ')).toBeOnTheScreen();
  });

  it('passes search query to useWorkerJobHistory for server-side search (HG-72 P2)', () => {
    render(<WorkerJobHistoryScreen />);

    const searchInput = screen.getByTestId('worker-history-search-input');
    fireEvent.changeText(searchInput, 'điều hòa');

    expect(mockHookFn).toHaveBeenCalledWith('all', 'điều hòa');
  });
});
