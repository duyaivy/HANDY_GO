import { useFocusEffect } from 'expo-router';
import * as React from 'react';
import { AppState } from 'react-native';

/** One timer for the nearest deadline, suspended while the screen/app is inactive. */
export function useDeadlineClock(deadlines: (string | null | undefined)[], refreshToken?: number) {
  const [now, setNow] = React.useState(() => Date.now());
  const [focused, setFocused] = React.useState(true);
  const [foreground, setForeground] = React.useState(
    AppState.currentState !== 'background' && AppState.currentState !== 'inactive',
  );
  const deadlineKey = JSON.stringify(deadlines);
  // Explicit wall-clock synchronization is needed when deadline inputs or focus change.
  // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
  const refreshClock = React.useCallback(() => setNow(Date.now()), []);

  useFocusEffect(React.useCallback(() => {
    setFocused(true);
    refreshClock();
    return () => setFocused(false);
  }, [refreshClock]));

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const isForeground = state !== 'background' && state !== 'inactive';
      setForeground(isForeground);
      if (isForeground)
        refreshClock();
    });
    return () => subscription.remove();
  }, [refreshClock]);

  React.useEffect(() => {
    refreshClock();
  }, [deadlineKey, refreshToken, refreshClock]);

  React.useEffect(() => {
    if (!focused || !foreground)
      return;
    const current = Date.now();
    const timestamps = (JSON.parse(deadlineKey) as (string | null)[])
      .map(value => value ? Date.parse(value) : Number.NaN)
      .filter(value => Number.isFinite(value) && value > current);
    if (!timestamps.length)
      return;
    const delay = Math.min(Math.min(...timestamps) - current, 2147483647);
    const timer = setTimeout(refreshClock, delay);
    return () => clearTimeout(timer);
  }, [deadlineKey, focused, foreground, now, refreshClock]);

  return { now, refreshClock };
}

export function isBeforeDeadline(deadline: string | null | undefined, now: number) {
  if (!deadline)
    return true;
  const timestamp = Date.parse(deadline);
  return Number.isFinite(timestamp) && timestamp > now;
}
