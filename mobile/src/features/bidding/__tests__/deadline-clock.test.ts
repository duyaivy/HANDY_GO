import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { isBeforeDeadline, useDeadlineClock } from '../hooks/use-deadline-clock';

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => { require('react').useEffect(callback, [callback]); },
}));
const start = Date.parse('2026-11-03T00:00:00Z');
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(start);
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it('expires exactly after five seconds while the screen stays open', () => {
  const deadline = new Date(start + 5000).toISOString();
  const { result } = renderHook(() => useDeadlineClock([deadline]));
  expect(isBeforeDeadline(deadline, result.current.now)).toBe(true);
  act(() => jest.advanceTimersByTime(5000));
  expect(isBeforeDeadline(deadline, result.current.now)).toBe(false);
  expect(jest.getTimerCount()).toBe(0);
});

it('cleans up in background and reconciles on foreground after the deadline', () => {
  const spy = jest.spyOn(AppState, 'addEventListener');
  spy.mockClear();
  const deadline = new Date(start + 5000).toISOString();
  const { result } = renderHook(() => useDeadlineClock([deadline]));
  const change = spy.mock.calls[0][1];
  act(() => change('background'));
  expect(jest.getTimerCount()).toBe(0);
  jest.setSystemTime(start + 10000);
  act(() => change('active'));
  expect(isBeforeDeadline(deadline, result.current.now)).toBe(false);
});

it('rechecks unchanged jobs on REST refetch and ignores invalid/null timer dates', () => {
  const deadline = new Date(start + 5000).toISOString();
  const { result, rerender } = renderHook(
    (props: { token: number }) => useDeadlineClock([deadline, null, 'invalid'], props.token),
    { initialProps: { token: 1 } },
  );
  jest.setSystemTime(start + 10000);
  rerender({ token: 2 });
  expect(isBeforeDeadline(deadline, result.current.now)).toBe(false);
  expect(isBeforeDeadline('invalid', result.current.now)).toBe(false);
  expect(isBeforeDeadline(null, result.current.now)).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
});

it('removes timer and listener on unmount before expiry', () => {
  const remove = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove });
  const { unmount } = renderHook(() => useDeadlineClock([new Date(start + 5000).toISOString()]));
  expect(jest.getTimerCount()).toBe(1);
  unmount();
  expect(jest.getTimerCount()).toBe(0);
  expect(remove).toHaveBeenCalledTimes(1);
});
