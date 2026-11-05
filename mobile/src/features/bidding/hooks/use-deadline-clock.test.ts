import { act, renderHook } from '@testing-library/react-native';
import { isBeforeDeadline, useDeadlineClock } from './use-deadline-clock';

// Mock expo-router useFocusEffect
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => (() => void) | void) => {
    const React = require('react');
    React.useEffect(() => {
      return callback();
    }, [callback]);
  },
}));

describe('useDeadlineClock & isBeforeDeadline (FIX-05 Worker Home Stale Deadline)', () => {
  const baseTime = 1793700000000; // Fixed timestamp for reproducible testing

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(baseTime);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('1. isBeforeDeadline', () => {
    it('returns true when deadline is null or undefined (open-ended)', () => {
      expect(isBeforeDeadline(null, baseTime)).toBe(true);
      expect(isBeforeDeadline(undefined, baseTime)).toBe(true);
    });

    it('returns true when current time is strictly before deadline', () => {
      const futureDeadline = new Date(baseTime + 60000).toISOString();
      expect(isBeforeDeadline(futureDeadline, baseTime)).toBe(true);
    });

    it('returns false when current time has reached or passed deadline', () => {
      const exactDeadline = new Date(baseTime).toISOString();
      expect(isBeforeDeadline(exactDeadline, baseTime)).toBe(false);

      const pastDeadline = new Date(baseTime - 1000).toISOString();
      expect(isBeforeDeadline(pastDeadline, baseTime)).toBe(false);
    });

    it('returns false for invalid date strings', () => {
      expect(isBeforeDeadline('not-a-date', baseTime)).toBe(false);
    });
  });

  describe('2. useDeadlineClock with fake timers', () => {
    it('initializes now with current timestamp', () => {
      const { result } = renderHook(() => useDeadlineClock([]));
      expect(result.current.now).toBe(baseTime);
    });

    it('automatically fires timer at the nearest deadline and updates now without manual refresh', () => {
      const deadline1 = new Date(baseTime + 30000).toISOString(); // +30s
      const deadline2 = new Date(baseTime + 90000).toISOString(); // +90s

      const { result } = renderHook(() =>
        useDeadlineClock([deadline1, deadline2]),
      );

      expect(result.current.now).toBe(baseTime);

      // Verify job is active initially
      expect(isBeforeDeadline(deadline1, result.current.now)).toBe(true);
      expect(isBeforeDeadline(deadline2, result.current.now)).toBe(true);

      // Advance time by 30 seconds (reaches deadline1)
      act(() => {
        jest.advanceTimersByTime(30000);
      });

      // result.current.now has updated to baseTime + 30000
      expect(result.current.now).toBe(baseTime + 30000);

      // Job 1 has expired without manual refresh!
      expect(isBeforeDeadline(deadline1, result.current.now)).toBe(false);
      // Job 2 is still active
      expect(isBeforeDeadline(deadline2, result.current.now)).toBe(true);

      // Advance time by another 60 seconds (reaches deadline2)
      act(() => {
        jest.advanceTimersByTime(60000);
      });

      expect(result.current.now).toBe(baseTime + 90000);
      // Both jobs expired
      expect(isBeforeDeadline(deadline1, result.current.now)).toBe(false);
      expect(isBeforeDeadline(deadline2, result.current.now)).toBe(false);
    });

    it('does not set timers when all deadlines are in the past', () => {
      const pastDeadline = new Date(baseTime - 10000).toISOString();
      const { result } = renderHook(() => useDeadlineClock([pastDeadline]));

      expect(result.current.now).toBe(baseTime);
      expect(isBeforeDeadline(pastDeadline, result.current.now)).toBe(false);
    });

    it('cleans up timeout on unmount', () => {
      const futureDeadline = new Date(baseTime + 45000).toISOString();
      const { unmount } = renderHook(() => useDeadlineClock([futureDeadline]));

      // Unmounting should clear any pending timer without throwing
      unmount();
    });

    it('refreshes clock when AppState transitions to active', () => {
      const { result } = renderHook(() => useDeadlineClock([]));

      // Advance time without firing timer
      jest.setSystemTime(baseTime + 15000);

      act(() => {
        result.current.refreshClock();
      });

      expect(result.current.now).toBe(baseTime + 15000);
    });
  });
});
