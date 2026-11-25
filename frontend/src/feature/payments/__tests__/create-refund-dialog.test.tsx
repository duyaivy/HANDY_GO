import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/shared/api/http";
import CreateRefundDialog from "../components/create-refund-dialog";

const mockMutateAsync = vi.fn();
const mockReset = vi.fn();
let currentUserId = "admin-1";

vi.mock("@/feature/auth/component/auth-session", () => ({
  useAuthUser: () => ({ id: currentUserId }),
}));

vi.mock("../hooks/use-refunds", () => ({
  useCreateRefund: () => ({
    isPending: false,
    isError: false,
    reset: mockReset,
    mutateAsync: mockMutateAsync,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

class MockBroadcastChannel {
  static channels = new Map<string, Set<MockBroadcastChannel>>();
  name: string;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(name: string) {
    this.name = name;
    const set = MockBroadcastChannel.channels.get(name) ?? new Set();
    set.add(this);
    MockBroadcastChannel.channels.set(name, set);
  }

  postMessage(data: unknown) {
    const peers = MockBroadcastChannel.channels.get(this.name);
    if (!peers) return;
    for (const peer of peers) {
      if (peer === this || !peer.onmessage) continue;
      peer.onmessage({ data } as MessageEvent);
    }
  }

  close() {
    MockBroadcastChannel.channels.get(this.name)?.delete(this);
  }

  static reset() {
    MockBroadcastChannel.channels.clear();
  }
}

function getPendingKey(userId: string, paymentId: string) {
  return `handygo:refund-pending:${encodeURIComponent(userId)}:${encodeURIComponent(paymentId)}:v1`;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function installLockMock(options?: { isBusy?: (name: string) => boolean }) {
  const heldLocks = new Set<string>();

  const request = vi.fn(
    async (
      name: string,
      lockOptionsOrCb: LockOptions | LockGrantedCallback<unknown>,
      maybeCb?: LockGrantedCallback<unknown>,
    ) => {
      const cb =
        typeof lockOptionsOrCb === "function" ? lockOptionsOrCb : maybeCb;
      const lockOptions =
        typeof lockOptionsOrCb === "function" ? {} : lockOptionsOrCb;
      if (!cb) throw new Error("Missing lock callback");

      const busy = heldLocks.has(name) || Boolean(options?.isBusy?.(name));
      if (lockOptions.ifAvailable && busy) {
        return cb(null);
      }

      heldLocks.add(name);
      try {
        return await cb({ name, mode: lockOptions.mode ?? "exclusive" });
      } finally {
        heldLocks.delete(name);
      }
    },
  );

  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: { request },
  });

  return { request, heldLocks };
}

describe("CreateRefundDialog (P1 idempotency, Web Locks & recovery)", () => {
  beforeEach(() => {
    currentUserId = "admin-1";
    window.localStorage.clear();
    MockBroadcastChannel.reset();
    mockMutateAsync.mockReset();
    mockReset.mockReset();
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);

    let uuidCounter = 0;
    vi.spyOn(globalThis.crypto, "randomUUID").mockImplementation(
      () => `00000000-0000-4000-8000-00000000000${++uuidCounter}`,
    );
    installLockMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function fillAndSubmit(amount = "50000", reason = "Hoàn tiền thử nghiệm") {
    const amountInput = screen.getByLabelText(/Số tiền hoàn/i);
    const reasonInput = screen.getByLabelText(/Lý do hoàn tiền/i);
    fireEvent.change(amountInput, { target: { value: amount } });
    fireEvent.change(reasonInput, { target: { value: reason } });
    const submitBtn = screen.getByRole("button", {
      name: /Xác nhận tạo yêu cầu|Gửi lại yêu cầu cũ/i,
    });
    fireEvent.submit(submitBtn.closest("form")!);
  }

  it("blocks double-submit before acquiring lock and sends only one request", async () => {
    const verifyDeferred = createDeferred<{
      disabled: boolean;
      refundableAmount: string | null;
      capacitySnapshot: string | null;
    }>();
    const onVerifyCapacity = vi.fn(() => verifyDeferred.promise);
    const onSubmittingChange = vi.fn();
    mockMutateAsync.mockResolvedValue({});

    render(
      <CreateRefundDialog
        paymentId="pay-1"
        disabled={false}
        refundableAmount="200000"
        capacitySnapshot="200000:succeeded:0:none:none"
        capacityLoading={false}
        capacityError={null}
        onVerifyCapacity={onVerifyCapacity}
        onSubmittingChange={onSubmittingChange}
      />,
    );

    const amountInput = screen.getByLabelText(/Số tiền hoàn/i);
    const reasonInput = screen.getByLabelText(/Lý do hoàn tiền/i);
    fireEvent.change(amountInput, { target: { value: "50000" } });
    fireEvent.change(reasonInput, { target: { value: "Khách hủy đơn" } });

    const form = amountInput.closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(onSubmittingChange).toHaveBeenCalledWith(true);
    expect(onVerifyCapacity).toHaveBeenCalledTimes(1);

    await act(async () => {
      verifyDeferred.resolve({
        disabled: false,
        refundableAmount: "200000",
        capacitySnapshot: "200000:succeeded:0:none:none",
      });
    });

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    });
  });

  it("aborts immediately when Web Lock is held by another tab (ifAvailable: true)", async () => {
    installLockMock({ isBusy: () => true });
    const onRefreshState = vi.fn();

    render(
      <CreateRefundDialog
        paymentId="pay-1"
        disabled={false}
        refundableAmount="200000"
        capacitySnapshot="200000:succeeded:0:none:none"
        capacityLoading={false}
        capacityError={null}
        onRefreshState={onRefreshState}
      />,
    );

    fillAndSubmit();

    await waitFor(() => {
      expect(
        screen.getByText(/đang được xử lý hoàn tiền ở một tab khác/i),
      ).toBeInTheDocument();
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(getPendingKey("admin-1", "pay-1"))).toBeNull();
    expect(onRefreshState).toHaveBeenCalled();
  });

  it("prevents duplicate refund when another tab completes first and changes capacitySnapshot", async () => {
    const onVerifyCapacity = vi.fn().mockResolvedValue({
      disabled: false,
      refundableAmount: "150000",
      capacitySnapshot: "150000:partially_refunded:1:ref-1:pending",
    });

    const { rerender } = render(
      <CreateRefundDialog
        paymentId="pay-1"
        disabled={false}
        refundableAmount="200000"
        capacitySnapshot="200000:succeeded:0:none:none"
        capacityLoading={false}
        capacityError={null}
        onVerifyCapacity={onVerifyCapacity}
      />,
    );

    // Giả lập React Query refetchOnWindowFocus cập nhật ngầm trước khi user bấm submit
    rerender(
      <CreateRefundDialog
        paymentId="pay-1"
        disabled={false}
        refundableAmount="150000"
        capacitySnapshot="150000:partially_refunded:1:ref-1:pending"
        capacityLoading={false}
        capacityError={null}
        onVerifyCapacity={onVerifyCapacity}
      />,
    );

    expect(
      screen.getByText(/vừa thay đổi từ thao tác khác/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Xác nhận tạo yêu cầu/i }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /Làm mới & tiếp tục/i }));

    await waitFor(() => {
      expect(onVerifyCapacity).toHaveBeenCalledTimes(1);
      expect(
        screen.getByRole("button", { name: /Xác nhận tạo yêu cầu/i }),
      ).toBeEnabled();
    });
  });

  it("does not generate a new key if retry pending storage was cleared by another tab", async () => {
    const key = getPendingKey("admin-1", "pay-1");
    window.localStorage.setItem(
      key,
      JSON.stringify({
        userId: "admin-1",
        paymentId: "pay-1",
        amount: "50000",
        reason: "Retry cũ",
        idempotencyKey: "old-key-123",
      }),
    );

    render(
      <CreateRefundDialog
        paymentId="pay-1"
        disabled={false}
        refundableAmount="200000"
        capacitySnapshot="200000:succeeded:0:none:none"
        capacityLoading={false}
        capacityError={null}
      />,
    );

    // Tab khác xóa pending trước khi tab hiện tại submit
    window.localStorage.removeItem(key);

    fireEvent.submit(
      screen.getByRole("button", { name: /Gửi lại yêu cầu cũ/i }).closest("form")!,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/đã được hoàn tất hoặc hủy ở tab khác/i),
      ).toBeInTheDocument();
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it("isolates pending operations across different payments and admin accounts", async () => {
    window.localStorage.setItem(
      getPendingKey("admin-1", "pay-1"),
      JSON.stringify({
        userId: "admin-1",
        paymentId: "pay-1",
        amount: "30000",
        reason: "Lỗi mạng pay-1",
        idempotencyKey: "key-pay-1",
      }),
    );

    // Cùng admin mở pay-2 không bị chặn bởi pending của pay-1
    mockMutateAsync.mockResolvedValue({});
    const { unmount } = render(
      <CreateRefundDialog
        key="admin-1:pay-2"
        paymentId="pay-2"
        disabled={false}
        refundableAmount="100000"
        capacitySnapshot="100000:succeeded:0:none:none"
        capacityLoading={false}
        capacityError={null}
      />,
    );

    fillAndSubmit("40000", "Hoàn tiền pay-2");

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    });
    expect(window.localStorage.getItem(getPendingKey("admin-1", "pay-1"))).not.toBeNull();

    unmount();

    // Admin khác (admin-2) mở pay-1 không đọc được pending của admin-1
    currentUserId = "admin-2";
    render(
      <CreateRefundDialog
        key="admin-2:pay-1"
        paymentId="pay-1"
        disabled={false}
        refundableAmount="100000"
        capacitySnapshot="100000:succeeded:0:none:none"
        capacityLoading={false}
        capacityError={null}
      />,
    );

    expect(screen.getByLabelText(/Số tiền hoàn/i)).toHaveValue("");
    expect(
      screen.getByRole("button", { name: /Xác nhận tạo yêu cầu/i }),
    ).toBeInTheDocument();
  });

  it("preserves idempotencyKey across ambiguous errors and reload, even when payment becomes refunded", async () => {
    mockMutateAsync.mockRejectedValueOnce(new Error("Network timeout"));

    const { unmount } = render(
      <CreateRefundDialog
        paymentId="pay-1"
        disabled={false}
        refundableAmount="100000"
        capacitySnapshot="100000:succeeded:0:none:none"
        capacityLoading={false}
        capacityError={null}
      />,
    );

    fillAndSubmit("100000", "Hoàn toàn bộ");

    await waitFor(() => {
      expect(
        screen.getByText(/Yêu cầu và mã chống trùng đã được giữ lại/i),
      ).toBeInTheDocument();
    });

    const firstKey = mockMutateAsync.mock.calls[0][0].input.idempotencyKey;
    unmount();

    // Reload / mở lại khi payment đã thành refunded (disabled = true)
    mockMutateAsync.mockResolvedValueOnce({});
    render(
      <CreateRefundDialog
        paymentId="pay-1"
        disabled={true}
        refundableAmount={null}
        capacitySnapshot={null}
        capacityLoading={false}
        capacityError={null}
      />,
    );

    expect(screen.getByLabelText(/Số tiền hoàn/i)).toHaveValue("100000");
    const retryBtn = screen.getByRole("button", { name: /Gửi lại yêu cầu cũ/i });
    expect(retryBtn).toBeEnabled();

    fireEvent.submit(retryBtn.closest("form")!);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledTimes(2);
    });
    expect(mockMutateAsync.mock.calls[1][0].input.idempotencyKey).toBe(firstKey);
  });

  it("releases pending on definitive 409 capacity rejection, but keeps on 403 retry or key conflict", async () => {
    mockMutateAsync.mockRejectedValueOnce(
      new HttpError({
        status: 409,
        payload: {
          code: "CONFLICT",
          message: "Refund reservations exceed the paid amount",
        },
      }),
    );

    render(
      <CreateRefundDialog
        paymentId="pay-1"
        disabled={false}
        refundableAmount="100000"
        capacitySnapshot="100000:succeeded:0:none:none"
        capacityLoading={false}
        capacityError={null}
      />,
    );

    fillAndSubmit("90000", "Hoàn tiền");

    await waitFor(() => {
      expect(
        screen.getByText(/vượt quá hạn mức còn lại/i),
      ).toBeInTheDocument();
    });
    expect(window.localStorage.getItem(getPendingKey("admin-1", "pay-1"))).toBeNull();
    expect(screen.getByLabelText(/Số tiền hoàn/i)).toHaveValue("90000");

    // Nếu gặp 403 khi retry pending có sẵn -> KHÔNG tự xóa
    window.localStorage.setItem(
      getPendingKey("admin-1", "pay-1"),
      JSON.stringify({
        userId: "admin-1",
        paymentId: "pay-1",
        amount: "50000",
        reason: "Retry",
        idempotencyKey: "saved-key",
      }),
    );

    const { unmount } = render(
      <CreateRefundDialog
        key="retry-403"
        paymentId="pay-1"
        disabled={false}
        refundableAmount="100000"
        capacitySnapshot="100000:succeeded:0:none:none"
        capacityLoading={false}
        capacityError={null}
      />,
    );
    unmount();
    render(
      <CreateRefundDialog
        key="retry-403-check"
        paymentId="pay-1"
        disabled={false}
        refundableAmount="100000"
        capacitySnapshot="100000:succeeded:0:none:none"
        capacityLoading={false}
        capacityError={null}
      />,
    );

    mockMutateAsync.mockRejectedValueOnce(
      new HttpError({
        status: 403,
        payload: { code: "FORBIDDEN", message: "Forbidden" },
      }),
    );

    fireEvent.submit(
      screen.getByRole("button", { name: /Gửi lại yêu cầu cũ/i }).closest("form")!,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Yêu cầu và mã chống trùng đã được giữ lại/i),
      ).toBeInTheDocument();
    });
    expect(window.localStorage.getItem(getPendingKey("admin-1", "pay-1"))).not.toBeNull();
  });

  it("does not allow unverified manual clear and shows runbook diagnostics for corrupted storage", async () => {
    const key = getPendingKey("admin-1", "pay-1");
    const rawCorrupted = "{broken-json";
    window.localStorage.setItem(key, rawCorrupted);
    const onRefreshState = vi.fn();

    render(
      <CreateRefundDialog
        paymentId="pay-1"
        disabled={false}
        refundableAmount="200000"
        capacitySnapshot="200000:succeeded:0:none:none"
        capacityLoading={false}
        capacityError={null}
        onRefreshState={onRefreshState}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /hủy trạng thái chờ/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Xác nhận tạo yêu cầu/i }),
    ).toBeDisabled();
    expect(screen.getByText(/Payment ID: pay-1/i)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Storage Key: ${key}`))).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Làm mới danh sách/i }));
    expect(onRefreshState).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(key)).toBe(rawCorrupted);
  });

  it("blocks repeated retries and exposes diagnostics when 409 idempotency conflict is unrecoverable", async () => {
    const key = getPendingKey("admin-1", "pay-1");
    window.localStorage.setItem(
      key,
      JSON.stringify({
        userId: "admin-1",
        paymentId: "pay-1",
        amount: "50000",
        reason: "Yêu cầu xung đột",
        idempotencyKey: "conflict-key-123",
      }),
    );

    const onRefreshState = vi.fn();
    mockMutateAsync.mockRejectedValueOnce(
      new HttpError({
        status: 409,
        payload: {
          code: "CONFLICT",
          message: "Idempotency key was used for another request",
        },
      }),
    );

    render(
      <CreateRefundDialog
        paymentId="pay-1"
        disabled={false}
        refundableAmount="200000"
        capacitySnapshot="200000:succeeded:0:none:none"
        capacityLoading={false}
        capacityError={null}
        onRefreshState={onRefreshState}
      />,
    );

    const retryBtn = screen.getByRole("button", { name: /Gửi lại yêu cầu cũ/i });
    fireEvent.submit(retryBtn.closest("form")!);

    await waitFor(() => {
      expect(
        screen.getByText(/gặp xung đột mã chống trùng và không thể tự gửi lại/i),
      ).toBeInTheDocument();
    });

    expect(retryBtn).toBeDisabled();
    expect(screen.getByText(/Payment ID: pay-1/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Idempotency Key: conflict-key-123/i),
    ).toBeInTheDocument();
    expect(window.localStorage.getItem(key)).not.toBeNull();
    expect(onRefreshState).toHaveBeenCalled();
  });
});

