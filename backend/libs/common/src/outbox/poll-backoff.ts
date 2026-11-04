/** Process-local cooldown shared by timer and on-demand triggers; never a DB retry loop. */
export class PollBackoff {
  private failures = 0;
  private nextAttempt = 0;
  ready(): boolean { return Date.now() >= this.nextAttempt; }
  reset(): void { this.failures = 0; this.nextAttempt = 0; }
  fail(): number {
    this.failures = Math.min(this.failures + 1, 6);
    const delay = Math.min(60000, 3000 * 2 ** (this.failures - 1) + Math.floor(Math.random() * 1000));
    this.nextAttempt = Date.now() + delay;
    return delay;
  }
}

export function safeOutboxError(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^(?:P[0-9]{4}|[0-9A-Z]{5}|ECONNRESET|ECONNREFUSED|ETIMEDOUT)$/.test(code)
    ? `dependency error (${code})` : 'dependency operation failed';
}
