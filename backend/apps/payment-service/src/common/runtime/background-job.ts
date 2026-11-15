// Background loops are disabled under test and can be switched off per flag with `<FLAG>=false`.
export function backgroundJobEnabled(flag: string): boolean {
  return process.env.NODE_ENV !== 'test' && process.env[flag]?.trim().toLowerCase() !== 'false';
}

export function startLoop(run: () => Promise<unknown>, intervalMs: number, onError: (error: unknown) => void): NodeJS.Timeout {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    run()
      .catch(onError)
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  timer.unref?.();
  return timer;
}

export function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown';
}
