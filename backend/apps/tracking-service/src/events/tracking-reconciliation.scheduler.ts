import {
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { TrackingEventsService } from './tracking-events.service.js';

@Injectable()
export class TrackingReconciliationScheduler
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(TrackingReconciliationScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private isReconciling = false;
  private lastRejectedAlertAt = 0;
  private readonly INTERVAL_MS =
    process.env.NODE_ENV === 'test' ? 1000 : 15000;

  constructor(private readonly eventsService: TrackingEventsService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.triggerReconciliation();
    }, this.INTERVAL_MS);
    this.timer.unref?.();
    this.logger.log(
      `Tracking pending order reconciliation scheduler initialized (interval: ${this.INTERVAL_MS}ms)`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async triggerReconciliation(): Promise<{
    scanned: number;
    flushedOrders: number;
    stalledOrders: number;
  }> {
    if (this.isReconciling) {
      return { scanned: 0, flushedOrders: 0, stalledOrders: 0 };
    }

    this.isReconciling = true;
    try {
      const result = await this.eventsService.reconcilePendingOrders();
      const rejectedCount = await this.eventsService.countUnresolvedRejectedEvents();
      if (rejectedCount > 0 && Date.now() - this.lastRejectedAlertAt >= 60_000) {
        this.logger.warn(`[REJECTED_TRACKING_EVENTS_ALERT] ${rejectedCount} unresolved events require replay`);
        this.lastRejectedAlertAt = Date.now();
      }
      return result;
    } catch (error: any) {
      this.logger.error(
        `Error during tracking pending order reconciliation: ${error.message}`,
        error.stack,
      );
      return { scanned: 0, flushedOrders: 0, stalledOrders: 0 };
    } finally {
      this.isReconciling = false;
    }
  }
}

