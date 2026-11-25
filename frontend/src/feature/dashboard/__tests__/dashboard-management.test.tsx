import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/shared/api/http";
import DashboardManagement from "../components/dashboard-management";
import { DashboardPopularServices } from "../components/DashboardPopularServices";
import { DashboardTopWorkers } from "../components/DashboardTopWorkers";
import type {
  DashboardOverview,
  OrderStatus,
  OrderTrend,
  TopService,
  TopWorker,
} from "../types/dashboard";

const mockUseDashboard = vi.fn();

vi.mock("../hooks/use-dashboard", () => ({
  useDashboard: (params: unknown) => mockUseDashboard(params),
}));

const sampleOverview: DashboardOverview = {
  revenue: { total: 12_500_000, currency: "VND" },
  orders: { total: 42 },
  workers: { activeInPeriod: 15 },
  customers: { totalCumulative: 320 },
};

const sampleTrend: OrderTrend = {
  granularity: "day",
  timeline: [
    { bucket: "2026-11-24", orderCount: 18 },
    { bucket: "2026-11-25", orderCount: 24 },
  ],
};

const sampleStatus: OrderStatus = {
  totalOrders: 42,
  groups: {
    completed: { count: 30, percentage: 71.4 },
    processing: { count: 8, percentage: 19.0 },
    cancelled: { count: 3, percentage: 7.1 },
    disputed: { count: 1, percentage: 2.4 },
  },
  performance: { completionRate: 71.4, cancellationRate: 7.1 },
};

const sampleWorkers: TopWorker[] = [
  {
    workerUserId: "w-1",
    fullName: "Nguyễn Văn A",
    avatarUrl: "https://cdn.example.com/a.jpg",
    completedOrderCount: 12,
    averageRating: 4.9,
  },
];

const sampleServices: TopService[] = [
  {
    serviceId: "s-1",
    name: "Sửa ống nước",
    iconUrl: "https://cdn.example.com/pipe.png",
    completedOrderCount: 20,
  },
];

function makeQueryState<T>(
  data: T | undefined,
  overrides?: Partial<{
    isPending: boolean;
    isFetching: boolean;
    isError: boolean;
    error: unknown;
    refetch: () => Promise<unknown>;
  }>,
) {
  return {
    data,
    isPending: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient();
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    ),
  };
}

describe("DashboardManagement & widgets (HG-75 P2 + P3)", () => {
  beforeEach(() => {
    mockUseDashboard.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders all 5 metrics correctly from API payloads", () => {
    mockUseDashboard.mockReturnValue({
      overview: makeQueryState(sampleOverview),
      orderTrend: makeQueryState(sampleTrend),
      orderStatus: makeQueryState(sampleStatus),
      topWorkers: makeQueryState(sampleWorkers),
      topServices: makeQueryState(sampleServices),
    });

    renderWithQueryClient(<DashboardManagement />);

    expect(screen.getByText("12,5 triệu ₫")).toBeInTheDocument();
    expect(screen.getByText("320")).toBeInTheDocument();
    expect(screen.getByText("đơn trong kỳ").parentElement).toHaveTextContent(
      /42\s*đơn trong kỳ/,
    );
    expect(screen.getByText("71,4%")).toBeInTheDocument();
    expect(screen.getByText("Nguyễn Văn A")).toBeInTheDocument();
    expect(screen.getByText("Sửa ống nước")).toBeInTheDocument();
  });

  it("shows loading, empty, and actionable error messages (401/403 non-retryable, 503 top-workers)", () => {
    const retryTopWorkers = vi.fn().mockResolvedValue({});
    mockUseDashboard.mockReturnValue({
      overview: makeQueryState(undefined, { isPending: true }),
      orderTrend: makeQueryState({ granularity: "day", timeline: [] }),
      orderStatus: makeQueryState(undefined, {
        isError: true,
        error: new HttpError({ status: 403, payload: { message: "Forbidden" } }),
      }),
      topWorkers: makeQueryState(undefined, {
        isError: true,
        error: new HttpError({
          status: 503,
          payload: { message: "Too many candidates" },
        }),
        refetch: retryTopWorkers,
      }),
      topServices: makeQueryState([]),
    });

    renderWithQueryClient(<DashboardManagement />);

    // Loading skeleton
    expect(screen.getByRole("status")).toBeInTheDocument();
    // Empty trend & services
    expect(
      screen.getByText("Chưa có dữ liệu trong khoảng thời gian này."),
    ).toBeInTheDocument();
    expect(screen.getByText("Chưa có dữ liệu dịch vụ")).toBeInTheDocument();
    // 403 -> không cho retry
    expect(
      screen.getByText(/không có quyền xem thống kê này/i),
    ).toBeInTheDocument();
    // 503 topWorkers -> hướng dẫn chọn kỳ ngắn hơn + có nút Thử lại
    expect(
      screen.getByText(/chọn khoảng thời gian ngắn hơn/i),
    ).toBeInTheDocument();
    const retryButtons = screen.getAllByRole("button", { name: "Thử lại" });
    expect(retryButtons).toHaveLength(1);
    fireEvent.click(retryButtons[0]);
    expect(retryTopWorkers).toHaveBeenCalledTimes(1);
  });

  it("updates preset dates on Vietnam midnight rollover without overriding custom dates", () => {
    vi.useFakeTimers();
    // 2026-11-25 23:59:50 VN (UTC+7) = 2026-11-25T16:59:50.000Z
    vi.setSystemTime(new Date("2026-11-25T16:59:50.000Z"));

    mockUseDashboard.mockReturnValue({
      overview: makeQueryState(sampleOverview),
      orderTrend: makeQueryState(sampleTrend),
      orderStatus: makeQueryState(sampleStatus),
      topWorkers: makeQueryState(sampleWorkers),
      topServices: makeQueryState(sampleServices),
    });

    const { queryClient } = renderWithQueryClient(<DashboardManagement />);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    expect(screen.getByText("27/10/2026 – 25/11/2026")).toBeInTheDocument();

    // Sang 00:00:20 ngày 26/11 giờ VN
    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(screen.getByText("28/10/2026 – 26/11/2026")).toBeInTheDocument();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["dashboard"] });

    // Nếu admin chọn custom range, qua ngày mới tiếp theo không ghi đè custom range
    fireEvent.click(screen.getByRole("button", { name: "Tùy chỉnh" }));
    fireEvent.change(screen.getByLabelText("Từ ngày"), {
      target: { value: "2026-11-01" },
    });
    fireEvent.change(screen.getByLabelText("Đến ngày"), {
      target: { value: "2026-11-10" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Áp dụng" }));
    expect(screen.getByText("01/11/2026 – 10/11/2026")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    });
    expect(screen.getByText("01/11/2026 – 10/11/2026")).toBeInTheDocument();
  });

  it("falls back to placeholder on broken avatar/service icon URLs and resets when URL changes", () => {
    const { rerender, container } = render(
      <>
        <DashboardTopWorkers data={sampleWorkers} />
        <DashboardPopularServices data={sampleServices} />
      </>,
    );

    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(2);

    fireEvent.error(images[0]);
    fireEvent.error(images[1]);
    expect(container.querySelectorAll("img")).toHaveLength(0);

    // Khi URL thay đổi sang URL mới, <img> phải render lại bình thường
    rerender(
      <>
        <DashboardTopWorkers
          data={[{ ...sampleWorkers[0], avatarUrl: "https://cdn.example.com/b.jpg" }]}
        />
        <DashboardPopularServices
          data={[{ ...sampleServices[0], iconUrl: "https://cdn.example.com/clean.png" }]}
        />
      </>,
    );
    expect(container.querySelectorAll("img")).toHaveLength(2);
  });
});

