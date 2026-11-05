import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { backgroundJobEnabled, errorName, startLoop } from '../common/runtime/background-job.js';
import { PaymentOrdersService } from '../payment-orders/payment-orders.service.js';
import { PayoutsService } from '../payouts/payouts.service.js';
import { TopupsService } from '../topups/topups.service.js';

const STALE_ATTEMPT_MS = 30_000;

export function reconcileIntervalMs(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.PAYMENT_RECONCILER_INTERVAL_MS);
  return Number.isInteger(parsed) && parsed >= 1_000 ? parsed : 15_000;
}

/** Periodic sweep that resolves uncertain outcomes; every step is idempotent and isolated from the others. */
@Injectable()
export class PaymentReconcilerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentReconcilerService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly orders: PaymentOrdersService,
    private readonly topups: TopupsService,
    private readonly payouts: PayoutsService,
  ) {}

  onModuleInit(): void {
    if (!backgroundJobEnabled('PAYMENT_RECONCILER_ENABLED')) return;
    this.timer = startLoop(
      () => this.runOnce(),
      reconcileIntervalMs(),
      (error) => this.logger.warn(`Reconciliation cycle failed: ${errorName(error)}`),
    );
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async runOnce(): Promise<Record<string, number | string>> {
    const steps: Array<[string, () => Promise<unknown>]> = [
      ['pointAttempts', () => this.orders.resumeStaleAttempts(STALE_ATTEMPT_MS)],
      ['commissions', () => this.orders.collectDueCommissions()],
      ['topups', async () => JSON.stringify(await this.topups.reconcile())],
      ['payouts', () => this.payouts.processBatch()],
    ];
    const summary: Record<string, number | string> = {};
    for (const [name, run] of steps) {
      try {
        const value = await run();
        summary[name] = typeof value === 'number' || typeof value === 'string' ? value : 'ok';
      } catch (error) {
        this.logger.warn(`Reconciliation step ${name} failed: ${errorName(error)}`);
        summary[name] = 'failed';
      }
    }
    return summary;
  }
}
