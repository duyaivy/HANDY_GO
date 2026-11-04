import type { BookingProposal } from '../types/order.types';
import { act, renderHook } from '@testing-library/react-native';
import { usePendingProposals } from './use-pending-proposals';

describe('usePendingProposals (FIX-02 Radar Optimistic Proposal State)', () => {
  const scope = 'user-1:req-100';

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  const createProposal = (id: string, workerUserId: string, status: string): BookingProposal => ({
    id,
    serviceRequestId: 'req-100',
    revisionNo: 1,
    customerUserId: 'user-1',
    workerUserId,
    status: status as any,
    selectionSource: 'bid',
    agreedPrice: 300000,
    agreedScope: 'Thợ sửa điện',
    expiresAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  it('1. Initializes proposedWorkerIds from authoritative server proposals', () => {
    const proposals: BookingProposal[] = [
      createProposal('prop-1', 'worker-1', 'proposed'),
      createProposal('prop-2', 'worker-2', 'rejected'),
      createProposal('prop-3', 'worker-3', 'withdrawn'),
    ];

    const { result } = renderHook(() => usePendingProposals(scope, proposals));

    expect(result.current.proposedWorkerIds.has('worker-1')).toBe(true);
    expect(result.current.proposedWorkerIds.has('worker-2')).toBe(false);
    expect(result.current.proposedWorkerIds.has('worker-3')).toBe(false);
  });

  it('2. begin(workerId) locks the worker optimistically and prevents duplicate submission', () => {
    const { result } = renderHook(() => usePendingProposals(scope, []));

    let allowed = false;
    act(() => {
      allowed = result.current.begin('worker-4');
    });

    expect(allowed).toBe(true);
    expect(result.current.proposedWorkerIds.has('worker-4')).toBe(true);

    // Attempt duplicate submission while pending
    let secondAttempt = true;
    act(() => {
      secondAttempt = result.current.begin('worker-4');
    });
    expect(secondAttempt).toBe(false);
  });

  it('3. Reconciles local optimistic state with server refetch after successful confirmation', () => {
    const { rerender, result } = renderHook(
      (props: { serverProposals: BookingProposal[] }) => usePendingProposals(scope, props.serverProposals),
      { initialProps: { serverProposals: [] as BookingProposal[] } },
    );

    act(() => {
      result.current.begin('worker-5');
    });
    expect(result.current.proposedWorkerIds.has('worker-5')).toBe(true);

    act(() => {
      result.current.confirm('worker-5', 'prop-5');
    });
    expect(result.current.proposedWorkerIds.has('worker-5')).toBe(true);

    // Server refetch arrives: proposal is confirmed as 'proposed'
    rerender({
      serverProposals: [createProposal('prop-5', 'worker-5', 'proposed')],
    });

    expect(result.current.proposedWorkerIds.has('worker-5')).toBe(true);
  });

  it('4. Unlocks the worker button when server proposal is rejected or withdrawn', () => {
    const { rerender, result } = renderHook(
      (props: { serverProposals: BookingProposal[] }) => usePendingProposals(scope, props.serverProposals),
      { initialProps: { serverProposals: [] as BookingProposal[] } },
    );

    act(() => {
      result.current.begin('worker-6');
      result.current.confirm('worker-6', 'prop-6');
    });

    // Server refetch returns proposed
    rerender({
      serverProposals: [createProposal('prop-6', 'worker-6', 'proposed')],
    });
    expect(result.current.proposedWorkerIds.has('worker-6')).toBe(true);

    // Subsequent server refetch returns rejected: button MUST unlock
    rerender({
      serverProposals: [createProposal('prop-6', 'worker-6', 'rejected')],
    });

    expect(result.current.proposedWorkerIds.has('worker-6')).toBe(false);
  });

  it('5. Unlocks the worker button when server proposal is withdrawn', () => {
    const { rerender, result } = renderHook(
      (props: { serverProposals: BookingProposal[] }) => usePendingProposals(scope, props.serverProposals),
      { initialProps: { serverProposals: [] as BookingProposal[] } },
    );

    act(() => {
      result.current.begin('worker-7');
      result.current.confirm('worker-7', 'prop-7');
    });

    rerender({
      serverProposals: [createProposal('prop-7', 'worker-7', 'proposed')],
    });
    expect(result.current.proposedWorkerIds.has('worker-7')).toBe(true);

    // Customer withdraws or proposal is withdrawn
    rerender({
      serverProposals: [createProposal('prop-7', 'worker-7', 'withdrawn')],
    });

    expect(result.current.proposedWorkerIds.has('worker-7')).toBe(false);
  });

  it('6. Cleans up pending state on fail(workerId)', () => {
    const { result } = renderHook(() => usePendingProposals(scope, []));

    act(() => {
      result.current.begin('worker-8');
    });
    expect(result.current.proposedWorkerIds.has('worker-8')).toBe(true);

    act(() => {
      result.current.fail('worker-8');
    });
    expect(result.current.proposedWorkerIds.has('worker-8')).toBe(false);
  });

  it('7. Automatically expires optimistic entry after confirmation timeout if server never confirms', () => {
    const { result } = renderHook(() => usePendingProposals(scope, []));

    act(() => {
      result.current.begin('worker-9');
      result.current.confirm('worker-9', 'prop-9');
    });
    expect(result.current.proposedWorkerIds.has('worker-9')).toBe(true);

    // Advance timers past 30 seconds
    act(() => {
      jest.advanceTimersByTime(31000);
    });

    expect(result.current.proposedWorkerIds.has('worker-9')).toBe(false);
  });

  it('8. Isolates pending proposals by scope (prevents bleeding when switching requests)', () => {
    const scopeA = 'user-1:req-A';
    const scopeB = 'user-1:req-B';

    const { rerender, result } = renderHook(
      (props: { activeScope: string }) => usePendingProposals(props.activeScope, []),
      { initialProps: { activeScope: scopeA } },
    );

    act(() => {
      result.current.begin('worker-10');
    });
    expect(result.current.proposedWorkerIds.has('worker-10')).toBe(true);

    // Switch to another request
    rerender({ activeScope: scopeB });
    expect(result.current.proposedWorkerIds.has('worker-10')).toBe(false);

    // Switch back to request A
    rerender({ activeScope: scopeA });
    expect(result.current.proposedWorkerIds.has('worker-10')).toBe(true);
  });
});
