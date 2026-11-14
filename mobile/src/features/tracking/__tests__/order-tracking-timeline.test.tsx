import type { TrackingMilestone, TrackingSummaryResponse } from '../types/tracking.types';
import * as React from 'react';
import { render, screen } from '@/lib/test-utils';
import { OrderTrackingTimeline } from '../components/order-tracking-timeline';
import { TrackingMilestoneItem } from '../components/tracking-milestone-item';

describe('TrackingMilestoneItem', () => {
  const baseMilestone: TrackingMilestone = {
    key: 'service_request',
    title: 'Đăng yêu cầu',
    description: 'Yêu cầu dịch vụ đã được gửi',
    status: 'completed',
    reachedAt: '2026-11-06T10:00:00.000Z',
  };

  it('renders completed milestone with correct title, description, and connector', () => {
    render(<TrackingMilestoneItem milestone={baseMilestone} isLast={false} />);

    expect(screen.getByText('Đăng yêu cầu')).toBeOnTheScreen();
    expect(screen.getByText('Yêu cầu dịch vụ đã được gửi')).toBeOnTheScreen();
    expect(screen.getByTestId('milestone-connector')).toBeOnTheScreen();
  });

  it('does not render connector if isLast is true', () => {
    render(<TrackingMilestoneItem milestone={baseMilestone} isLast={true} />);

    expect(screen.getByText('Đăng yêu cầu')).toBeOnTheScreen();
    expect(screen.queryByTestId('milestone-connector')).toBeNull();
  });

  it('renders in_progress milestone with active styles', () => {
    const inProgressMilestone: TrackingMilestone = {
      key: 'order_execution',
      title: 'Thực hiện dịch vụ',
      description: 'Thợ đang tiến hành công việc',
      status: 'in_progress',
      reachedAt: null,
    };

    render(<TrackingMilestoneItem milestone={inProgressMilestone} isLast={false} />);
    expect(screen.getByText('Thực hiện dịch vụ')).toBeOnTheScreen();
    expect(screen.getByText('Thợ đang tiến hành công việc')).toBeOnTheScreen();
  });

  it('renders disputed / alert milestone gracefully', () => {
    const disputedMilestone: TrackingMilestone = {
      key: 'dispute',
      title: 'Khiếu nại & Tranh chấp',
      description: 'Đang xử lý tranh chấp',
      status: 'skipped',
      reachedAt: null,
    };

    render(<TrackingMilestoneItem milestone={disputedMilestone} isLast={true} />);
    expect(screen.getByText('Khiếu nại & Tranh chấp')).toBeOnTheScreen();
  });
});

describe('OrderTrackingTimeline', () => {
  const mockSummary: TrackingSummaryResponse = {
    serviceRequestId: 'req-001',
    orderId: 'ord-001',
    customerId: 'cust-001',
    currentPhase: 'ORDER_IN_PROGRESS',
    lastUpdatedAt: '2026-11-06T10:30:00.000Z',
    milestones: [
      {
        key: 'service_request',
        title: 'Đăng yêu cầu',
        description: 'Yêu cầu dịch vụ đã được gửi thành công',
        status: 'completed',
        reachedAt: '2026-11-06T10:00:00.000Z',
      },
      {
        key: 'order_execution',
        title: 'Thực hiện dịch vụ',
        description: 'Thợ đang thực hiện',
        status: 'in_progress',
        reachedAt: '2026-11-06T10:15:00.000Z',
      },
    ],
  };

  it('renders loading state when isLoading is true', () => {
    render(
      <OrderTrackingTimeline
        isLoading={true}
        connectionStatus="reconnecting"
      />,
    );

    expect(screen.getByTestId('tracking-timeline-loading')).toBeOnTheScreen();
    expect(screen.getByText('Đang tải tiến trình công việc...')).toBeOnTheScreen();
  });

  it('returns null if summary is undefined and not loading', () => {
    render(
      <OrderTrackingTimeline
        isLoading={false}
        connectionStatus="disconnected"
      />,
    );

    expect(screen.queryByTestId('tracking-timeline-container')).toBeNull();
    expect(screen.queryByTestId('tracking-timeline-loading')).toBeNull();
    expect(screen.queryByText('Tiến trình công việc')).toBeNull();
  });

  it('renders live timeline and connected status badge', () => {
    render(
      <OrderTrackingTimeline
        summary={mockSummary}
        isLoading={false}
        connectionStatus="connected"
      />,
    );

    expect(screen.getByText('Tiến trình công việc')).toBeOnTheScreen();
    expect(screen.getByText('Trực tiếp')).toBeOnTheScreen();
    expect(screen.getByText('Đăng yêu cầu')).toBeOnTheScreen();
    expect(screen.getByText('Thực hiện dịch vụ')).toBeOnTheScreen();
  });

  it('renders reconnecting and offline badges correctly', () => {
    const { rerender } = render(
      <OrderTrackingTimeline
        summary={mockSummary}
        isLoading={false}
        connectionStatus="reconnecting"
      />,
    );

    expect(screen.getByText('Đang kết nối lại...')).toBeOnTheScreen();

    rerender(
      <OrderTrackingTimeline
        summary={mockSummary}
        isLoading={false}
        connectionStatus="disconnected"
      />,
    );

    expect(screen.getByText('Ngoại tuyến')).toBeOnTheScreen();
  });

  it('computes milestones automatically if summary has empty milestones array', () => {
    const summaryWithoutMilestones: TrackingSummaryResponse = {
      serviceRequestId: 'req-002',
      orderId: 'ord-002',
      customerId: 'cust-002',
      currentPhase: 'SEEKING_WORKERS',
      lastUpdatedAt: '2026-11-06T10:00:00.000Z',
      milestones: [],
      serviceRequest: {
        status: 'published',
        createdAt: '2026-11-06T09:00:00.000Z',
        publishedAt: '2026-11-06T09:05:00.000Z',
      },
    };

    render(
      <OrderTrackingTimeline
        summary={summaryWithoutMilestones}
        isLoading={false}
        connectionStatus="connected"
      />,
    );

    expect(screen.getByText('Tiến trình công việc')).toBeOnTheScreen();
    expect(screen.getByText('Đăng yêu cầu')).toBeOnTheScreen();
    expect(screen.getByText('Tìm thợ & Báo giá')).toBeOnTheScreen();
  });
});
