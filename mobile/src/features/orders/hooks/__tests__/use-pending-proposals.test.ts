import type { BookingProposal } from '../../types/order.types';
import { act, renderHook } from '@testing-library/react-native';
import { usePendingProposals } from '../use-pending-proposals';

const proposal = (status: string, id = 'new') => ({ id, workerUserId: 'worker', status } as BookingProposal);

describe('Radar proposal confirmation', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it.each(['rejected', 'withdrawn', 'cancelled', 'expired', 'accepted'])('releases optimistic state when server confirms %s', (status) => {
    const { result, rerender } = renderHook(
      (props: { proposals: BookingProposal[] }) => usePendingProposals('user:request', props.proposals),
      { initialProps: { proposals: [] as BookingProposal[] } },
    );
    act(() => {
      expect(result.current.begin('worker')).toBe(true);
      expect(result.current.begin('worker')).toBe(false);
      result.current.confirm('worker', 'new');
    });
    // A stale read, including an older rejected proposal, cannot undo the write.
    rerender({ proposals: [proposal('rejected', 'old')] });
    expect(result.current.proposedWorkerIds.has('worker')).toBe(true);
    rerender({ proposals: [proposal(status)] });
    expect(result.current.proposedWorkerIds.has('worker')).toBe(false);
  });

  it('hands off to proposed server state then releases after worker rejection/customer withdrawal', () => {
    const { result, rerender } = renderHook(
      (props: { proposals: BookingProposal[] }) => usePendingProposals('user:request', props.proposals),
      { initialProps: { proposals: [] as BookingProposal[] } },
    );
    act(() => {
      result.current.begin('worker');
      result.current.confirm('worker', 'new');
    });
    rerender({ proposals: [proposal('proposed')] });
    expect(result.current.proposedWorkerIds.has('worker')).toBe(true);
    rerender({ proposals: [proposal('withdrawn')] });
    expect(result.current.proposedWorkerIds.has('worker')).toBe(false);
  });

  it('bounds unknown 409 confirmation and isolates requests and accounts', () => {
    const { result, rerender } = renderHook(
      (props: { scope: string }) => usePendingProposals(props.scope),
      { initialProps: { scope: 'user:request1' } },
    );
    act(() => {
      result.current.begin('worker');
      result.current.confirm('worker');
    });
    rerender({ scope: 'user:request2' });
    expect(result.current.proposedWorkerIds.has('worker')).toBe(false);
    rerender({ scope: 'other-user:request1' });
    expect(result.current.proposedWorkerIds.has('worker')).toBe(false);
    rerender({ scope: 'user:request1' });
    expect(result.current.proposedWorkerIds.has('worker')).toBe(true);
    act(() => {
      jest.advanceTimersByTime(30000);
    });
    expect(result.current.proposedWorkerIds.has('worker')).toBe(false);
  });

  it('releases failed mutation immediately and cleans confirmation timeout on unmount', () => {
    const { result, unmount } = renderHook(() => usePendingProposals('user:request'));
    act(() => {
      result.current.begin('worker');
      result.current.fail('worker');
    });
    expect(result.current.proposedWorkerIds.has('worker')).toBe(false);
    act(() => {
      result.current.begin('worker');
      result.current.confirm('worker');
    });
    unmount();
    expect(jest.getTimerCount()).toBe(0);
  });
});
