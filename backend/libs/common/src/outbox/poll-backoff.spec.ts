import { afterEach, expect, it, vi } from 'vitest';
import { PollBackoff } from './poll-backoff.js';
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it('caps repeated failures at 60 seconds and resets after recovery', () => {
  vi.useFakeTimers(); vi.spyOn(Math, 'random').mockReturnValue(0.999);
  const retry = new PollBackoff();
  for (let n = 0; n < 100; n++) {
    const delay = retry.fail();
    expect(delay).toBeGreaterThanOrEqual(3000);
    expect(delay).toBeLessThanOrEqual(60000);
    expect(retry.ready()).toBe(false);
    vi.advanceTimersByTime(delay);
    expect(retry.ready()).toBe(true);
  }
  retry.reset();
  expect(retry.fail()).toBe(3999);
});
