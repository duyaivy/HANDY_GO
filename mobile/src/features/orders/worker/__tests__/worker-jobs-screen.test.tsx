/* eslint-disable react/no-unnecessary-use-prefix */
import * as React from 'react';
import { cleanup, fireEvent, render, screen } from '@/lib/test-utils';
import { WorkerJobCompleteScreen } from '../screens/worker-job-complete-screen';
import { WorkerJobDetailScreen } from '../screens/worker-job-detail-screen';
import { WorkerJobsScreen } from '../screens/worker-jobs-screen';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockMutateAsync = jest.fn();

jest.mock('../../hooks/use-worker-jobs', () => {
  const actual = jest.requireActual('../../hooks/use-worker-jobs');
  return {
    ...actual,
    useWorkerJobs: () => ({
      proposals: [
        {
          id: 'prop-1',
          agreedScope: 'Sửa đường ống nước bồn rửa chén (Mẫu)',
          agreedPrice: 300000,
          status: 'proposed',
          serviceRequest: {
            addressText: '123 Nguyễn Lương Bằng, Hòa Khánh Bắc, Đà Nẵng',
          },
        },
      ],
      activeOrders: [],
      isLoading: false,
      isRefetching: false,
      hasNextProposals: false,
      hasNextOrders: false,
      isFetchingNextProposals: false,
      isFetchingNextOrders: false,
      fetchNextProposals: jest.fn(),
      fetchNextOrders: jest.fn(),
      refetch: jest.fn(),
    }),
    useAcceptProposal: () => ({
      mutateAsync: mockMutateAsync,
      isPending: false,
    }),
  };
});

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: mockBack,
  }),
  useLocalSearchParams: () => ({ id: 'JOB-1020' }),
}));

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

describe('workerJobsScreen and execution flow', () => {
  it('renders screen title and placeholder message', () => {
    render(<WorkerJobsScreen />);
    expect(screen.getByText('Công việc của tôi')).toBeOnTheScreen();
    expect(screen.getByTestId('orders-worker-jobs-screen')).toBeOnTheScreen();
    expect(screen.getByText('Chức năng đang được phát triển')).toBeOnTheScreen();
  });

  it('allows switching between "Lời mời nhận việc" and "Đang thi công" tabs', () => {
    render(<WorkerJobsScreen />);

    const activeTabBtn = screen.getByTestId('worker-jobs-tab-active');
    fireEvent.press(activeTabBtn);

    const proposalsTabBtn = screen.getByTestId('worker-jobs-tab-proposals');
    fireEvent.press(proposalsTabBtn);

    expect(screen.getByTestId('accept-job-btn')).toBeOnTheScreen();
  });

  it('handles accepting a proposal in proposals tab', () => {
    render(<WorkerJobsScreen />);

    const acceptBtn = screen.getByTestId('accept-job-btn');
    fireEvent.press(acceptBtn);
  });

  it('renders WorkerJobDetailScreen with readiness and start order actions', () => {
    render(<WorkerJobDetailScreen jobId="JOB-1020" />);

    expect(screen.getByText('Chi tiết đơn việc')).toBeOnTheScreen();
    expect(screen.getByText('Mã đơn: #JOB-1020')).toBeOnTheScreen();
    expect(screen.getByTestId('worker-job-detail-screen')).toBeOnTheScreen();

    // Sẵn sàng -> Bắt đầu làm -> Báo xong việc
    const readinessBtn = screen.getByTestId('worker-confirm-readiness-btn');
    fireEvent.press(readinessBtn);

    const startBtn = screen.getByTestId('worker-start-order-btn');
    fireEvent.press(startBtn);

    const completeNavBtn = screen.getByTestId('worker-complete-job-nav-btn');
    fireEvent.press(completeNavBtn);
    expect(mockPush).toHaveBeenCalledWith('/worker/jobs/JOB-1020/complete');
  });

  it('renders WorkerJobCompleteScreen with evidence photo attachment and finish order action', () => {
    render(<WorkerJobCompleteScreen jobId="JOB-1020" />);

    expect(screen.getByText('Nghiệm thu công việc')).toBeOnTheScreen();
    expect(screen.getByTestId('worker-job-complete-screen')).toBeOnTheScreen();

    const addPhotoBtn = screen.getByTestId('add-evidence-photo-btn');
    fireEvent.press(addPhotoBtn);

    const finishBtn = screen.getByTestId('worker-finish-order-btn');
    fireEvent.press(finishBtn);
  });
});
